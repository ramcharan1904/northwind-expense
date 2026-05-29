import uuid
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel
from typing import Literal


VALID_TRANSITIONS: dict[str, list[str]] = {
    "draft":    ["pending"],
    "pending":  [],                        # pending→reviewed is automatic only
    "reviewed": ["approved", "rejected"],
    "approved": [],
    "rejected": [],
}


class SubmissionCreate(BaseModel):
    employee_id: uuid.UUID
    trip_purpose: str | None = None
    trip_start: date | None = None
    trip_end: date | None = None
    destination: str | None = None


class SubmissionStatusUpdate(BaseModel):
    status: Literal["pending", "reviewed", "approved", "rejected"]


class SubmissionSummaryResponse(BaseModel):
    model_config = {"from_attributes": True}

    submission_id: uuid.UUID
    status: str
    trip_purpose: str | None
    trip_start: date | None
    trip_end: date | None
    destination: str | None
    created_at: datetime
    updated_at: datetime
    employee_id: uuid.UUID
    employee_ref: str
    employee_name: str
    grade: int
    department: str | None
    receipt_count: int
    reviewed_count: int
    compliant_count: int
    flagged_count: int
    rejected_count: int
    ambiguous_count: int
    override_count: int
    total_amount: Decimal


class SubmissionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    employee_id: uuid.UUID
    trip_purpose: str | None
    trip_start: date | None
    trip_end: date | None
    destination: str | None
    status: str
    created_at: datetime
    updated_at: datetime
