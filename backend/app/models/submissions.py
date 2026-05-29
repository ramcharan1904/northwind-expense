import uuid
from datetime import datetime, date
from sqlalchemy import String, Date, DateTime, ForeignKey, Enum as SAEnum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
    trip_purpose: Mapped[str | None] = mapped_column(String, nullable=True)
    trip_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    trip_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    destination: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(
        SAEnum("draft", "pending", "reviewed", "approved", "rejected",
               name="submission_status_enum", create_type=False),
        nullable=False,
        default="draft",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    receipts: Mapped[list["Receipt"]] = relationship("Receipt", back_populates="submission", lazy="selectin")  # noqa: F821
