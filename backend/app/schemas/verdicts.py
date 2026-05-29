import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, field_validator


class CitationItem(BaseModel):
    doc_id: str
    section: str | None = None
    quote: str


class VerdictOutput(BaseModel):
    """Schema-constrained LLM verdict output — validated at the boundary."""
    verdict: Literal["compliant", "flagged", "rejected", "ambiguous"]
    confidence: float
    reasoning: str
    cited_clauses: list[CitationItem] = []

    @field_validator("confidence")
    @classmethod
    def clamp_confidence(cls, v: float) -> float:
        return max(0.0, min(1.0, v))


class VerdictCitationResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    doc_id: str
    section: str | None
    quoted_text: str
    relevance_score: Decimal | None
    quote_verbatim: bool
    semantic_support: Decimal | None


class OverrideResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    original_verdict: str
    new_verdict: str
    reviewer_email: str
    reviewer_name: str | None
    comment: str
    created_at: datetime


class VerdictResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    receipt_id: uuid.UUID
    submission_id: uuid.UUID
    verdict: str
    confidence: Decimal
    reasoning: str
    model_used: str | None
    prompt_version: str | None
    retrieval_score: Decimal | None
    created_at: datetime
    citations: list[VerdictCitationResponse] = []
    overrides: list[OverrideResponse] = []
    current_verdict: str | None = None
    is_overridden: bool = False
