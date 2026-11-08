"""SQLAlchemy ORM models for scoring and seasonality."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
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


class VisitorsMonthlyORM(Base):
    __tablename__ = "visitors_monthly"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    place_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("places.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    visitors: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("place_id", "year", "month", name="uq_visitors_place_year_month"),
        Index("ix_visitors_place_year_month", "place_id", "year", "month"),
        CheckConstraint("month BETWEEN 1 AND 12", name="ck_visitors_month"),
        CheckConstraint("year BETWEEN 2000 AND 2100", name="ck_visitors_year"),
        CheckConstraint("visitors >= 0", name="ck_visitors_non_negative"),
    )


class ScoreORM(Base):
    __tablename__ = "scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    place_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("places.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(nullable=False)
    score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    confidence: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
    breakdown_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    weights_version: Mapped[str] = mapped_column(String(50), nullable=False)

    __table_args__ = (
        UniqueConstraint("place_id", "date", name="uq_score_place_date"),
        Index("ix_score_place_date", "place_id", "date"),
        CheckConstraint("score BETWEEN 0 AND 100", name="ck_score_range"),
        CheckConstraint("confidence BETWEEN 0 AND 1", name="ck_score_confidence"),
    )
