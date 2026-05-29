import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Text, DateTime, ForeignKey, Enum as SAEnum, Numeric, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Verdict(Base):
    __tablename__ = "verdicts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    receipt_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("receipts.id"), nullable=False)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"), nullable=False)
    verdict: Mapped[str] = mapped_column(
        SAEnum("compliant", "flagged", "rejected", "ambiguous",
               name="verdict_enum", create_type=False),
        nullable=False,
    )
    confidence: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    model_used: Mapped[str | None] = mapped_column(String, nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(String, nullable=True)
    retrieval_score: Mapped[Decimal | None] = mapped_column(Numeric(4, 3), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    receipt: Mapped["Receipt"] = relationship("Receipt", back_populates="verdict")  # noqa: F821
    citations: Mapped[list["VerdictCitation"]] = relationship(
        "VerdictCitation", back_populates="verdict", lazy="selectin"
    )
    overrides: Mapped[list["Override"]] = relationship(  # noqa: F821
        "Override", back_populates="verdict", lazy="selectin"
    )


class VerdictCitation(Base):
    __tablename__ = "verdict_citations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    verdict_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("verdicts.id"), nullable=False)
    policy_chunk_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("policy_chunks.id"), nullable=True)
    doc_id: Mapped[str] = mapped_column(String, nullable=False)
    section: Mapped[str | None] = mapped_column(String, nullable=True)
    quoted_text: Mapped[str] = mapped_column(Text, nullable=False)
    relevance_score: Mapped[Decimal | None] = mapped_column(Numeric(4, 3), nullable=True)
    quote_verbatim: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    semantic_support: Mapped[Decimal | None] = mapped_column(Numeric(4, 3), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    verdict: Mapped["Verdict"] = relationship("Verdict", back_populates="citations")
