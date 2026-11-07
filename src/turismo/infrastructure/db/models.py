"""SQLAlchemy ORM models.

Schema constraints (CHECK, UNIQUE, FK) are defined here, not only in Python.
This ensures correctness even if the DB is accessed outside the ORM.
"""
from __future__ import annotations

# date and datetime must be runtime imports: SQLAlchemy resolves Mapped[date]
# annotations at class-creation time, even with `from __future__ import annotations`.
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
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


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


class PlaceORM(Base):
    __tablename__ = "places"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    osm_id: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="unclassified")
    coast_type: Mapped[str] = mapped_column(String(20), nullable=False)
    lat: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    lon: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    location_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        CheckConstraint(
            "category IN ('hotel','restaurant','attraction')",
            name="ck_place_category",
        ),
        CheckConstraint(
            "kind IN ('attraction','lodging','food','activity','unclassified')",
            name="ck_place_kind",
        ),
        CheckConstraint("coast_type IN ('coastal','inland')", name="ck_place_coast_type"),
        # DB-level CHECK uses broad geographic range; the tight La Libertad bbox
        # (-8.5 to -7.5 lat, -79.6 to -77.8 lon) is enforced by the Pydantic
        # validator before any row reaches this table.
        CheckConstraint("lat BETWEEN -90 AND 90", name="ck_place_lat"),
        CheckConstraint("lon BETWEEN -180 AND 180", name="ck_place_lon"),
        Index("ix_places_category", "category"),
        Index("ix_places_kind", "kind"),
    )


class PlaceDetailORM(Base):
    __tablename__ = "place_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    place_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("places.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    opening_hours: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cuisine: Mapped[str | None] = mapped_column(String(100), nullable=True)
    stars: Mapped[float | None] = mapped_column(Numeric(3, 1), nullable=True)
    user_rating_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_min: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    price_max: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="PEN")
    menu_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    maps_url: Mapped[str] = mapped_column(String(500), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    local_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    google_place_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    reviews_json: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    safety_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    safety_report_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_place_details_place_id", "place_id"),
        CheckConstraint("price_level BETWEEN 1 AND 4", name="ck_place_details_price_level"),
        CheckConstraint("safety_score BETWEEN 0 AND 100", name="ck_place_details_safety_score"),
    )


class OfferORM(Base):
    __tablename__ = "offers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    place_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("places.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # dish | room | tour
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="PEN")
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_offers_place_id", "place_id"),
        CheckConstraint("price > 0", name="ck_offer_price_positive"),
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


class ScrapeRunORM(Base):
    __tablename__ = "scrape_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    collector: Mapped[str] = mapped_column(String(100), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    rows_upserted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_rejected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('ok','partial','failed','skipped')", name="ck_scrape_status"
        ),
        Index("ix_scrape_collector_started", "collector", "started_at"),
    )
