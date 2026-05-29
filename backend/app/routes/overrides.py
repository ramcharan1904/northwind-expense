import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.models.verdicts import Verdict
from app.models.overrides import Override
from app.models.submissions import Submission
from app.schemas.overrides import OverrideCreate, OverrideResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/verdicts", tags=["overrides"])


@router.post("/{verdict_id}/override", response_model=OverrideResponse, status_code=201)
async def create_override(
    verdict_id: uuid.UUID,
    body: OverrideCreate,
    db: AsyncSession = Depends(get_db),
):
    verdict = await db.get(Verdict, verdict_id)
    if not verdict:
        raise HTTPException(status_code=404, detail="Verdict not found")

    override = Override(
        verdict_id=verdict_id,
        original_verdict=verdict.verdict,
        new_verdict=body.new_verdict,
        reviewer_email=body.reviewer_email,
        reviewer_name=body.reviewer_name,
        comment=body.comment,
    )
    db.add(override)
    await db.flush()

    # Human override is final — immediately resolve submission status.
    # Re-evaluate all current verdicts (respecting this and prior overrides).
    submission = await db.get(Submission, verdict.submission_id)
    if submission and submission.status in ("approved", "rejected", "reviewed"):
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
            {"sid": str(verdict.submission_id)},
        )
        current_verdicts = [row.current_verdict for row in cv_result.fetchall()]
        new_status = "rejected" if "rejected" in current_verdicts else "approved"
        submission.status = new_status
        await db.flush()
        logger.info("submission_resolved_by_override", extra={
            "submission_id": str(verdict.submission_id),
            "new_status": new_status,
            "current_verdicts": current_verdicts,
        })

    logger.info("override_created", extra={
        "verdict_id": str(verdict_id),
        "reviewer_email": body.reviewer_email,
        "original_verdict": verdict.verdict,
        "new_verdict": body.new_verdict,
    })
    return override
