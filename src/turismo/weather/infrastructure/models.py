"""SQLAlchemy ORM models for climate locations, weather, and marine observations."""
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


class LocationORM(Base):
    """Climate measurement points (not the same as tourist places)."""

    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    lat: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    lon: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    is_coastal: Mapped[bool] = mapped_column(nullable=False, default=False)

    __table_args__ = (
        CheckConstraint("lat BETWEEN -90 AND 90", name="ck_location_lat"),
        CheckConstraint("lon BETWEEN -180 AND 180", name="ck_location_lon"),
    )


class WeatherDailyORM(Base):
    __tablename__ = "weather_daily"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    location_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(nullable=False)
    temp_max_c: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    temp_min_c: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    precipitation_mm: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    rain_probability: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False)
    uv_index: Mapped[float] = mapped_column(Numeric(4, 1), nullable=False)
    wind_speed_kmh: Mapped[float] = mapped_column(Numeric(5, 1), nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("location_id", "date", name="uq_weather_location_date"),
        Index("ix_weather_location_date", "location_id", "date"),
        CheckConstraint("rain_probability BETWEEN 0 AND 1", name="ck_weather_rain_prob"),
    )


class MarineDailyORM(Base):
    __tablename__ = "marine_daily"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    location_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(nullable=False)
    wave_height_m: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False)
    wave_period_s: Mapped[float] = mapped_column(Numeric(4, 1), nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("location_id", "date", name="uq_marine_location_date"),
        Index("ix_marine_location_date", "location_id", "date"),
    )
