import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.database import get_db
from app.models.verdicts import Verdict
from app.models.receipts import Receipt
from app.schemas.verdicts import VerdictResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["verdicts"])


@router.get("/submissions/{submission_id}/verdicts", response_model=list[VerdictResponse])
async def list_submission_verdicts(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """List all verdicts for a submission, resolved via current_verdicts view."""
    result = await db.execute(
        text("""
            SELECT
                cv.*,
                r.file_name
            FROM current_verdicts cv
            JOIN receipts r ON r.id = cv.receipt_id
            WHERE cv.submission_id = :submission_id
            ORDER BY r.created_at
        """),
        {"submission_id": str(submission_id)},
    )
    rows = result.fetchall()

    # Load full verdict objects for response
    verdict_ids = [row.verdict_id for row in rows]
    if not verdict_ids:
        return []

    verdicts_result = await db.execute(
        select(Verdict).where(Verdict.id.in_(verdict_ids))
    )
    verdicts = {v.id: v for v in verdicts_result.scalars().all()}

    responses = []
    for row in rows:
        v = verdicts.get(row.verdict_id)
        if v:
            resp = VerdictResponse.model_validate(v)
            resp.current_verdict = row.current_verdict
            resp.is_overridden = row.is_overridden
            responses.append(resp)

    return responses
