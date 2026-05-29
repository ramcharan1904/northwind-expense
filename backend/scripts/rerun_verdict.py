"""Re-run verdict generation for specific verdict IDs using the current prompt version.

Usage (from backend/ directory):
    python scripts/rerun_verdict.py <verdict_id> [<verdict_id> ...]

Outputs new verdict IDs so you can update eval/expected_results.json.
"""
import asyncio
import sys
import uuid
from pathlib import Path

# Add backend root to path so app imports work
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from app.database import AsyncSessionLocal as async_session_factory
from app.models.verdicts import Verdict
from app.models.receipts import Receipt, ReceiptExtraction
from app.models.submissions import Submission
from app.models.employees import Employee
from app.schemas.receipts import ExtractionOutput
from app.services.retrieval import retrieve_policy_chunks
from app.services.verdict_engine import generate_verdict


async def rerun_verdict(verdict_id_str: str) -> None:
    vid = uuid.UUID(verdict_id_str)

    async with async_session_factory() as db:
        # Load the original verdict to find receipt / submission
        old_verdict = await db.get(Verdict, vid)
        if not old_verdict:
            print(f"  ERROR: verdict {vid} not found", file=sys.stderr)
            return

        receipt = await db.get(Receipt, old_verdict.receipt_id)
        submission = await db.get(Submission, old_verdict.submission_id)
        employee_obj = await db.get(Employee, submission.employee_id)

        # Load extraction
        ext_result = await db.execute(
            select(ReceiptExtraction).where(ReceiptExtraction.receipt_id == receipt.id)
        )
        extraction_row = ext_result.scalars().first()
        if not extraction_row:
            print(f"  ERROR: no extraction for receipt {receipt.id}", file=sys.stderr)
            return

        extraction = ExtractionOutput(
            amount=float(extraction_row.amount) if extraction_row.amount else None,
            currency=extraction_row.currency,
            vendor=extraction_row.vendor,
            category=extraction_row.category,
            expense_date=str(extraction_row.expense_date) if extraction_row.expense_date else None,
            description=extraction_row.description,
            extraction_confidence=float(extraction_row.extraction_confidence) if extraction_row.extraction_confidence else 0.0,
        )

        employee_context = {
            "name": employee_obj.name if employee_obj else None,
            "grade": employee_obj.grade if employee_obj else None,
            "department": employee_obj.department if employee_obj else None,
            "trip_purpose": submission.trip_purpose,
            "trip_start": str(submission.trip_start) if submission.trip_start else None,
            "trip_end": str(submission.trip_end) if submission.trip_end else None,
            "destination": submission.destination,
        }

        # Retrieve fresh policy chunks
        receipt_text = receipt.raw_text or str(extraction.model_dump())
        chunks = await retrieve_policy_chunks(db, receipt_text, employee_context)

        # Generate new verdict (inserts a new row)
        new_verdict = await generate_verdict(
            db=db,
            receipt_id=receipt.id,
            submission_id=submission.id,
            employee=employee_context,
            extraction=extraction,
            chunks=chunks,
            raw_text=receipt.raw_text or None,
        )
        await db.commit()

        print(f"OLD verdict_id: {old_verdict.id}  verdict={old_verdict.verdict}")
        print(f"NEW verdict_id: {new_verdict.id}  verdict={new_verdict.verdict}  confidence={new_verdict.confidence:.2f}")
        print(f"  reasoning: {new_verdict.reasoning[:120]}...")
        print()


async def main(verdict_ids: list[str]) -> None:
    for vid in verdict_ids:
        print(f"Re-running verdict {vid} ...")
        await rerun_verdict(vid)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/rerun_verdict.py <verdict_id> [<verdict_id> ...]")
        sys.exit(1)
    asyncio.run(main(sys.argv[1:]))
