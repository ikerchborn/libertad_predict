"""SQLAlchemy ORM model for hotel price snapshots."""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from turismo.shared.db import Base


class PriceSnapshotORM(Base):
    __tablename__ = "price_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    place_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("places.id", ondelete="CASCADE"), nullable=False
    )
    date_stay: Mapped[date] = mapped_column(nullable=False)
    date_scraped: Mapped[date] = mapped_column(nullable=False)
    price_usd: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "place_id", "date_stay", "date_scraped", "source", name="uq_price_snapshot"
        ),
        Index("ix_price_place_stay", "place_id", "date_stay"),
        CheckConstraint("price_usd > 0", name="ck_price_positive"),
    )
