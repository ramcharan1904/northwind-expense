import uuid
from datetime import datetime
from pydantic import BaseModel


class EmployeeCreate(BaseModel):
    employee_ref: str
    name: str
    email: str | None = None
    grade: int
    title: str | None = None
    department: str | None = None
    manager_ref: str | None = None
    home_base: str | None = None


class EmployeeResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    employee_ref: str
    name: str
    email: str | None
    grade: int
    title: str | None
    department: str | None
    manager_ref: str | None
    home_base: str | None
    created_at: datetime
