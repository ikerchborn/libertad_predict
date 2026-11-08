"""Shared domain entities and value objects (pure Python, zero I/O)."""
from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

from turismo.shared.geo import LA_LIBERTAD_BBOX, BoundingBox

__all__ = [
    "LA_LIBERTAD_BBOX",
    "BoundingBox",
    "CoastType",
    "Event",
    "FactorResult",
    "MarineDay",
    "Offer",
    "Place",
    "PlaceCategory",
    "PlaceDetail",
    "PlaceKind",
    "PlaceReview",
    "PlaceSafetyReport",
    "PriceSnapshot",
    "RecommendationFactor",
    "RecommendationResult",
    "RunResult",
    "ScoreResult",
    "VisitorsMonth",
    "WeatherDay",
]


class PlaceCategory(StrEnum):
    HOTEL = "hotel"
    RESTAURANT = "restaurant"
    ATTRACTION = "attraction"


class PlaceKind(StrEnum):
    ATTRACTION = "attraction"
    LODGING = "lodging"
    FOOD = "food"
    ACTIVITY = "activity"
    UNCLASSIFIED = "unclassified"


class CoastType(StrEnum):
    COASTAL = "coastal"
    INLAND = "inland"


class Place(BaseModel):
    """A tourist place in La Libertad."""

    model_config = ConfigDict(strict=True, frozen=True)

    id: int | None = Field(default=None)
    osm_id: int
    name: str = Field(min_length=1, max_length=300)
    category: PlaceCategory
    coast_type: CoastType
    lat: float = Field(ge=-90.0, le=90.0)
    lon: float = Field(ge=-180.0, le=180.0)
    address: str | None = Field(default=None, max_length=500)
    source: str = Field(min_length=1, max_length=50)
    kind: PlaceKind = Field(default=PlaceKind.UNCLASSIFIED)


class WeatherDay(BaseModel):
    """Daily weather observation or forecast for a location."""

    model_config = ConfigDict(strict=True, frozen=True)

    location_id: int
    date: date
    temp_max_c: float = Field(ge=-20.0, le=60.0)
    temp_min_c: float = Field(ge=-20.0, le=60.0)
    precipitation_mm: float = Field(ge=0.0, le=500.0)
    rain_probability: float = Field(ge=0.0, le=1.0)
    uv_index: float = Field(ge=0.0, le=20.0)
    wind_speed_kmh: float = Field(ge=0.0, le=300.0)
    source: str = Field(min_length=1, max_length=50)
    fetched_at: datetime


class MarineDay(BaseModel):
    """Daily marine conditions for coastal locations."""

    model_config = ConfigDict(strict=True, frozen=True)

    location_id: int
    date: date
    wave_height_m: float = Field(ge=0.0, le=20.0)
    wave_period_s: float = Field(ge=0.0, le=30.0)
    source: str = Field(min_length=1, max_length=50)
    fetched_at: datetime


class FactorResult(BaseModel):
    """Result for a single scoring factor."""

    model_config = ConfigDict(strict=True, frozen=True)

    name: str = Field(min_length=1, max_length=100)
    value: float = Field(ge=0.0, le=1.0)
    weight: float = Field(ge=0.0)
    contribution: float = Field(ge=0.0, le=1.0)
    data_source: str = Field(min_length=1, max_length=100)
    data_date: date
    explanation: str = Field(min_length=1, max_length=500)


class ScoreResult(BaseModel):
    """Final scoring result for a place on a specific date."""

    model_config = ConfigDict(strict=True, frozen=True)

    place_id: int
    date: date
    score: float = Field(ge=0.0, le=100.0)
    confidence: float = Field(ge=0.0, le=1.0)
    breakdown: list[FactorResult]
    computed_at: datetime
    weights_version: str = Field(min_length=1, max_length=50)


class VisitorsMonth(BaseModel):
    """Monthly visitor count for a place (from MINCETUR)."""

    model_config = ConfigDict(strict=True, frozen=True)

    place_id: int
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    visitors: int = Field(ge=0)
    source: str = Field(min_length=1, max_length=50)
    fetched_at: datetime


class PriceSnapshot(BaseModel):
    """A single price observation for a hotel/place."""

    model_config = ConfigDict(strict=True, frozen=True)

    place_id: int
    date_stay: date
    date_scraped: date
    price_usd: float = Field(gt=0.0, le=10000.0)
    source: str = Field(min_length=1, max_length=50)
    fetched_at: datetime


class Event(BaseModel):
    """A calendar event affecting tourism (from config/events.yaml)."""

    model_config = ConfigDict(strict=True)

    name: str = Field(min_length=1, max_length=200)
    date_start: date
    date_end: date
    crowd_level: int = Field(ge=1, le=5)

    @field_validator("date_end")
    @classmethod
    def _end_after_start(cls, v: date, info: ValidationInfo) -> date:
        if info.data and "date_start" in info.data and v < info.data["date_start"]:
            raise ValueError("date_end must be >= date_start")
        return v


class RunResult(BaseModel):
    """Result from a collector run."""

    model_config = ConfigDict(strict=True, frozen=True)

    collector: str = Field(min_length=1, max_length=100)
    rows_upserted: int = Field(ge=0)
    rows_rejected: int = Field(ge=0)
    status: str  # ok | partial | failed | skipped
    error: str | None = Field(default=None, max_length=500)


class PlaceReview(BaseModel):
    """A verified user review from an external source (e.g. Google Places)."""

    model_config = ConfigDict(strict=True, frozen=True)

    author_name: str = Field(min_length=1, max_length=120)
    rating: float = Field(ge=1.0, le=5.0)
    text: str = Field(min_length=1, max_length=1000)
    relative_time: str | None = Field(default=None, max_length=100)


class PlaceSafetyReport(BaseModel):
    """Official georeferenced safety and crime diagnosis from MININTER/SIDPOL."""

    model_config = ConfigDict(frozen=True)

    score: float = Field(ge=0.0, le=100.0)
    risk_level: str = Field(min_length=1, max_length=50)
    incident_count: int = Field(ge=0)
    radius_meters: int = Field(default=1000, ge=100)
    shifts: dict[str, int] = Field(default_factory=dict)
    shift_percentages: dict[str, float] = Field(default_factory=dict)
    critical_shift: str = Field(default="noche", max_length=50)
    unsafe_hours: str = Field(min_length=1, max_length=200)
    safe_hours: str = Field(min_length=1, max_length=200)
    unsafe_dates_notice: str = Field(min_length=1, max_length=300)
    top_crimes: list[dict[str, Any]] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    source: str = Field(
        default="MININTER - Sistema de Denuncias Policiales (SIDPOL)", max_length=100
    )
    evaluated_at: datetime | str


class PlaceDetail(BaseModel):
    """Enriched commercial details for a place."""

    model_config = ConfigDict(strict=True, frozen=True)

    place_id: int
    website: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=500)
    opening_hours: str | None = Field(default=None, max_length=200)
    cuisine: str | None = Field(default=None, max_length=100)
    stars: float | None = Field(default=None, ge=1.0, le=5.0)
    user_rating_count: int | None = Field(default=None, ge=0)
    price_level: int | None = Field(default=None, ge=1, le=4)
    price_min: float | None = Field(default=None, ge=0.0)
    price_max: float | None = Field(default=None, ge=0.0)
    currency: str = Field(default="PEN", max_length=10)
    menu_url: str | None = Field(default=None, max_length=500)
    maps_url: str = Field(min_length=1, max_length=500)
    image_url: str | None = Field(default=None, max_length=1000)
    local_image_path: str | None = Field(default=None, max_length=500)
    google_place_id: str | None = Field(default=None, max_length=255)
    reviews: list[PlaceReview] = Field(default_factory=list)
    safety_score: float | None = Field(default=None, ge=0.0, le=100.0)
    safety_report: PlaceSafetyReport | None = None
    source: str = Field(min_length=1, max_length=50)
    fetched_at: datetime

    @property
    def external_rating(self) -> float | None:
        """Alias for stars."""
        return self.stars


class Offer(BaseModel):
    """Specific commercial offer snapshot (dish, room, tour)."""

    model_config = ConfigDict(strict=True, frozen=True)

    place_id: int
    kind: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=200)
    price: float = Field(gt=0.0)
    currency: str = Field(default="PEN", max_length=10)
    captured_at: datetime


class RecommendationFactor(BaseModel):
    """Factor in the commercial recommendation index."""

    model_config = ConfigDict(strict=True, frozen=True)

    name: str = Field(min_length=1, max_length=100)
    score: float = Field(ge=0.0, le=1.0)
    weight: float = Field(ge=0.0)
    contribution: float = Field(ge=0.0, le=1.0)
    explanation: str = Field(min_length=1, max_length=300)


class RecommendationResult(BaseModel):
    """Recommendation score for commercial places (lodging, food, activity)."""

    model_config = ConfigDict(strict=True, frozen=True)

    place_id: int
    kind: PlaceKind
    score: float = Field(ge=0.0, le=100.0)
    confidence: float = Field(ge=0.0, le=1.0)
    summary: str = Field(min_length=1, max_length=300)
    breakdown: list[RecommendationFactor]
    distance_km: float | None = Field(default=None, ge=0.0)
    computed_at: datetime
