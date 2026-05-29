import logging
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.submissions import Submission
from app.models.receipts import Receipt, ReceiptExtraction
from app.models.employees import Employee
from app.models.verdicts import Verdict, VerdictCitation
from app.schemas.receipts import ReceiptResponse, ExtractionOutput
from app.services.storage import storage_service
from app.services.receipt_extraction import extract_receipt
from app.services.retrieval import retrieve_policy_chunks
from app.services.verdict_engine import generate_verdict
from app.config import get_settings
import io

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/api", tags=["receipts"])

ALLOWED_TYPES = {"pdf", "jpg", "jpeg", "png", "txt"}


@router.post("/submissions/{submission_id}/receipts", response_model=ReceiptResponse, status_code=201)
async def upload_receipt(
    submission_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    submission = await db.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Determine file type
    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_TYPES:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: {ext}. Allowed: {ALLOWED_TYPES}")
    file_type = "jpg" if ext == "jpeg" else ext

    file_bytes = await file.read()
    logger.info("receipt_uploaded", extra={
        "submission_id": str(submission_id),
        "file_name": filename,
        "file_type": file_type,
        "size_bytes": len(file_bytes),
    })

    # Store file (relative path, never file:// URL)
    relative_path = await storage_service.upload(file_bytes, filename)

    # Extract text/data from receipt
    raw_text, extraction_method, extraction_output = await extract_receipt(file_bytes, file_type, filename)

    # Persist receipt row
    receipt = Receipt(
        submission_id=submission_id,
        file_name=filename,
        file_path=relative_path,
        file_type=file_type,
        raw_text=raw_text or None,
        extraction_method=extraction_method,
    )
    db.add(receipt)
    await db.flush()

    # Persist extraction row
    extraction_row = ReceiptExtraction(
        receipt_id=receipt.id,
        amount=extraction_output.amount,
        currency=extraction_output.currency,
        vendor=extraction_output.vendor,
        category=extraction_output.category,
        expense_date=(
            date.fromisoformat(extraction_output.expense_date)
            if extraction_output.expense_date else None
        ),
        description=extraction_output.description,
        extraction_confidence=extraction_output.extraction_confidence,
        extracted_json=extraction_output.model_dump(),
        model_used=None if extraction_method == "plaintext" else settings.openai_model,
    )
    db.add(extraction_row)
    await db.flush()

    logger.info("extraction_complete", extra={
        "receipt_id": str(receipt.id),
        "method": extraction_method,
        "confidence": extraction_output.extraction_confidence,
    })

    # Load employee context for retrieval
    employee = await db.get(Employee, submission.employee_id)
    employee_context = {
        "name": employee.name if employee else None,
        "grade": employee.grade if employee else None,
        "department": employee.department if employee else None,
        "trip_purpose": submission.trip_purpose,
        "trip_start": str(submission.trip_start) if submission.trip_start else None,
        "trip_end": str(submission.trip_end) if submission.trip_end else None,
        "destination": submission.destination,
    }

    # Employee ownership check — if receipt has a cardholder name that clearly
    # doesn't belong to the submission's employee, reject immediately.
    mismatch_reason = _check_employee_mismatch(
        extraction_output, employee.name if employee else None
    )
    if mismatch_reason:
        logger.warning("receipt_employee_mismatch", extra={
            "receipt_id": str(receipt.id),
            "submission_employee": employee.name if employee else None,
            "cardholder_name": extraction_output.cardholder_name,
        })
        verdict = Verdict(
            receipt_id=receipt.id,
            submission_id=submission_id,
            verdict="rejected",
            confidence=0.99,
            reasoning=mismatch_reason,
            model_used="system",
            prompt_version="ownership_check_v1",
            retrieval_score=None,
        )
        db.add(verdict)
        await db.flush()

        if submission.status == "pending":
            await _maybe_auto_review(db, submission)
        await db.flush()

        result = await db.execute(select(Receipt).where(Receipt.id == receipt.id))
        return result.scalar_one()

    # Retrieve relevant policy chunks
    receipt_text = raw_text or str(extraction_output.model_dump())
    chunks = await retrieve_policy_chunks(db, receipt_text, employee_context)

    # Generate verdict (pass raw_text so LLM can see line-item detail)
    verdict = await generate_verdict(
        db=db,
        receipt_id=receipt.id,
        submission_id=submission_id,
        employee=employee_context,
        extraction=extraction_output,
        chunks=chunks,
        raw_text=raw_text or None,
    )

    # Auto-transition pending → reviewed if all receipts now have verdicts
    if submission.status == "pending":
        await _maybe_auto_review(db, submission)

    await db.flush()

    # Reload receipt with relationships for response
    result = await db.execute(
        select(Receipt).where(Receipt.id == receipt.id)
    )
    return result.scalar_one()


@router.get("/receipts/{receipt_id}/file")
async def get_receipt_file(receipt_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Stream receipt file bytes. Works for both local and R2 storage."""
    receipt = await db.get(Receipt, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")

    try:
        file_bytes = await storage_service.get_file_bytes(receipt.file_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found in storage")

    media_type_map = {
        "pdf": "application/pdf",
        "jpg": "image/jpeg",
        "png": "image/png",
        "txt": "text/plain",
    }
    media_type = media_type_map.get(receipt.file_type, "application/octet-stream")

    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{receipt.file_name}"'},
    )


async def _maybe_auto_review(db: AsyncSession, submission: Submission) -> None:
    """Auto-transition pending → reviewed when all receipts have verdicts."""
    receipts_result = await db.execute(
        select(Receipt).where(Receipt.submission_id == submission.id)
    )
    receipts = receipts_result.scalars().all()
    if not receipts:
        return

    verdict_result = await db.execute(
        select(Verdict).where(Verdict.submission_id == submission.id)
    )
    verdicts = verdict_result.scalars().all()

    if len(verdicts) >= len(receipts):
        submission.status = "reviewed"
        logger.info("submission_auto_reviewed", extra={"submission_id": str(submission.id)})


def _check_employee_mismatch(extraction: ExtractionOutput, employee_name: str | None) -> str | None:
    """Return a rejection reason if the receipt's cardholder clearly doesn't match the employee.
    Returns None when names match or when there's insufficient data to make a determination.
    """
    if not extraction.cardholder_name or not employee_name:
        return None  # can't compare — don't reject on uncertainty

    from rapidfuzz import fuzz
    cardholder = extraction.cardholder_name.strip().lower()
    employee = employee_name.strip().lower()

    # Exact or very close match → no mismatch
    if fuzz.ratio(cardholder, employee) >= 75:
        return None

    # Check if any word in employee name appears in cardholder (handles "Sarah Chen" vs "S. Chen")
    employee_parts = [p for p in employee.split() if len(p) > 1]
    matches = sum(1 for part in employee_parts if part in cardholder)
    if matches >= 1 and len(employee_parts) > 0:
        return None

    return (
        f"Receipt rejected: cardholder name '{extraction.cardholder_name}' does not match "
        f"the submission employee '{employee_name}'. Receipts must belong to the submitting employee. "
        f"Please upload receipts belonging to {employee_name} only."
    )
