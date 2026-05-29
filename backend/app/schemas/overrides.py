import uuid
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, field_validator


class OverrideCreate(BaseModel):
    new_verdict: Literal["compliant", "flagged", "rejected", "ambiguous"]
    reviewer_email: str
    reviewer_name: str | None = None
    comment: str

    @field_validator("comment")
    @classmethod
    def comment_required(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Override comment is required")
        return v.strip()


class OverrideResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    verdict_id: uuid.UUID
    original_verdict: str
    new_verdict: str
    reviewer_email: str
    reviewer_name: str | None
    comment: str
    created_at: datetime
