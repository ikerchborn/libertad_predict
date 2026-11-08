"""SQLAlchemy ORM model for calendar events."""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from turismo.shared.db import Base


class EventORM(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    date_start: Mapped[date] = mapped_column(nullable=False)
    date_end: Mapped[date] = mapped_column(nullable=False)
    crowd_level: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="events.yaml")
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        CheckConstraint("crowd_level BETWEEN 1 AND 5", name="ck_event_crowd"),
        CheckConstraint("date_end >= date_start", name="ck_event_dates"),
        UniqueConstraint("name", "date_start", name="uq_event_name_start"),
        Index("ix_event_dates", "date_start", "date_end"),
    )
