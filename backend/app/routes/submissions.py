import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.database import get_db
from app.models.submissions import Submission
from app.models.employees import Employee
from app.models.receipts import Receipt
from app.models.verdicts import Verdict
from app.schemas.submissions import (
    SubmissionCreate, SubmissionResponse, SubmissionStatusUpdate, VALID_TRANSITIONS
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/submissions", tags=["submissions"])


@router.get("", response_model=list[SubmissionResponse])
async def list_submissions(
    employee_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(Submission).order_by(Submission.created_at.desc())
    if employee_id:
        q = q.where(Submission.employee_id == employee_id)
    if status:
        q = q.where(Submission.status == status)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=SubmissionResponse, status_code=201)
async def create_submission(body: SubmissionCreate, db: AsyncSession = Depends(get_db)):
    employee = await db.get(Employee, body.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    existing = await db.execute(
        select(Submission).where(
            Submission.employee_id == body.employee_id,
            Submission.status == "draft",
            Submission.destination == body.destination,
            Submission.trip_start == body.trip_start,
            Submission.trip_end == body.trip_end,
        )
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=409,
            detail="A draft submission already exists for this employee with the same destination and trip dates.",
        )

    submission = Submission(**body.model_dump())
    db.add(submission)
    await db.flush()
    await db.refresh(submission)
    logger.info("submission_created", extra={"submission_id": str(submission.id)})
    return submission


@router.get("/{submission_id}", response_model=SubmissionResponse)
async def get_submission(submission_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    submission = await db.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    return submission


@router.patch("/{submission_id}/status", response_model=SubmissionResponse)
async def update_submission_status(
    submission_id: uuid.UUID,
    body: SubmissionStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    submission = await db.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    allowed = VALID_TRANSITIONS.get(submission.status, [])
    if body.status not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot transition from '{submission.status}' to '{body.status}'. "
                   f"Allowed: {allowed or 'none (terminal state)'}",
        )

    # When approving, all current verdicts must be compliant — rejected or ambiguous blocks approval
    if body.status == "approved":
        cv_result = await db.execute(
            text("""
                SELECT COALESCE(ov.new_verdict, v.verdict) AS current_verdict
                FROM verdicts v
                LEFT JOIN LATERAL (
                    SELECT new_verdict FROM overrides o
                    WHERE o.verdict_id = v.id
                    ORDER BY o.created_at DESC LIMIT 1
                ) ov ON TRUE
                WHERE v.submission_id = :sid
            """),
            {"sid": str(submission_id)},
        )
        current_verdicts = [row.current_verdict for row in cv_result.fetchall()]
        blocking = [v for v in current_verdicts if v in ("rejected", "ambiguous")]
        if blocking:
            raise HTTPException(
                status_code=422,
                detail=f"Cannot approve: {len(blocking)} receipt(s) have verdict(s) that require resolution "
                       f"({', '.join(set(blocking))}). Override them to compliant or flagged first.",
            )

    submission.status = body.status
    await db.flush()

    # When moving to pending, auto-advance to reviewed if all receipts already have verdicts
    if body.status == "pending":
        receipts_result = await db.execute(
            select(Receipt).where(Receipt.submission_id == submission_id)
        )
        receipts = receipts_result.scalars().all()
        if receipts:
            verdicts_result = await db.execute(
                select(Verdict).where(Verdict.submission_id == submission_id)
            )
            verdicts = verdicts_result.scalars().all()
            if len(verdicts) >= len(receipts):
                submission.status = "reviewed"
                await db.flush()
                logger.info("submission_auto_reviewed", extra={"submission_id": str(submission_id)})

    await db.refresh(submission)
    logger.info("submission_status_updated", extra={
        "submission_id": str(submission_id),
        "new_status": body.status,
    })
    return submission
