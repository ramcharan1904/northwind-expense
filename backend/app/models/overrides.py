import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, Enum as SAEnum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Override(Base):
    __tablename__ = "overrides"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    verdict_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("verdicts.id"), nullable=False)
    original_verdict: Mapped[str] = mapped_column(
        SAEnum("compliant", "flagged", "rejected", "ambiguous",
               name="verdict_enum", create_type=False),
        nullable=False,
    )
    new_verdict: Mapped[str] = mapped_column(
        SAEnum("compliant", "flagged", "rejected", "ambiguous",
               name="verdict_enum", create_type=False),
        nullable=False,
    )
    reviewer_email: Mapped[str] = mapped_column(String, nullable=False)
    reviewer_name: Mapped[str | None] = mapped_column(String, nullable=True)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    verdict: Mapped["Verdict"] = relationship("Verdict", back_populates="overrides")  # noqa: F821
