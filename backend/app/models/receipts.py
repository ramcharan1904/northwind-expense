import uuid
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import String, Text, DateTime, Date, ForeignKey, Enum as SAEnum, Numeric, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Receipt(Base):
    __tablename__ = "receipts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"), nullable=False)
    file_name: Mapped[str] = mapped_column(String, nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)   # relative path, never file:///
    file_type: Mapped[str] = mapped_column(
        SAEnum("pdf", "jpg", "png", "txt", name="file_type_enum", create_type=False),
        nullable=False,
    )
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extraction_method: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    submission: Mapped["Submission"] = relationship("Submission", back_populates="receipts")  # noqa: F821
    extraction: Mapped["ReceiptExtraction | None"] = relationship(
        "ReceiptExtraction", back_populates="receipt", uselist=False, lazy="selectin"
    )
    verdict: Mapped["Verdict | None"] = relationship(  # noqa: F821
        "Verdict", back_populates="receipt", uselist=False, lazy="selectin"
    )


class ReceiptExtraction(Base):
    __tablename__ = "receipt_extractions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    receipt_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("receipts.id"), nullable=False)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String, nullable=True)
    vendor: Mapped[str | None] = mapped_column(String, nullable=True)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    expense_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    extraction_confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3), nullable=True)
    extracted_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    model_used: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    receipt: Mapped["Receipt"] = relationship("Receipt", back_populates="extraction")
