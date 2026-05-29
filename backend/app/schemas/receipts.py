import uuid
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel


class ExtractionOutput(BaseModel):
    """Schema-constrained LLM extraction output — validated at the boundary."""
    amount: float | None = None
    currency: str | None = "USD"
    vendor: str | None = None
    category: str | None = None
    expense_date: str | None = None      # ISO date string
    description: str | None = None
    extraction_confidence: float = 0.5


class ReceiptExtractionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    amount: Decimal | None
    currency: str | None
    vendor: str | None
    category: str | None
    expense_date: date | None
    description: str | None
    extraction_confidence: Decimal | None
    model_used: str | None
    created_at: datetime


class ReceiptResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    submission_id: uuid.UUID
    file_name: str
    file_type: str
    raw_text: str | None
    extraction_method: str | None
    created_at: datetime
    extraction: ReceiptExtractionResponse | None = None
