"""SQLAlchemy ORM models for places, details, and commercial offers."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from turismo.shared.db import Base


class PlaceORM(Base):
    __tablename__ = "places"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    osm_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)
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
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="PEN")
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_offers_place_id", "place_id"),
        CheckConstraint("price > 0", name="ck_offer_price_positive"),
    )
