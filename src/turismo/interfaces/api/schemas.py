"""Pydantic schemas for the REST API (request and response DTOs).

Strict typing with Pydantic v2.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from turismo.domain.models import CoastType, PlaceCategory, PlaceKind


class PlaceReviewOut(BaseModel):
    author_name: str
    rating: float
    text: str
    relative_time: str | None = None


class PlaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    osm_id: int
    name: str
    category: PlaceCategory
    kind: PlaceKind = Field(default=PlaceKind.UNCLASSIFIED)
    coast_type: CoastType
    lat: float
    lon: float
    address: str | None = None

    # Differentiated index fields:
    convenience_score: float | None = Field(
        default=None, description="Índice de conveniencia (0-100, para atracciones)"
    )
    recommendation_score: float | None = Field(
        default=None, description="Índice de recomendación (0-100, para lodging/food/activity)"
    )
    score: float | None = Field(
        default=None, description="Score general compatible con clientes existentes"
    )
    confidence: float | None = Field(default=None, description="Confianza del score (0.0 a 1.0)")
    recommendation_summary: str | None = Field(
        default=None, description="Resumen explicativo de recomendación en español"
    )

    # Commercial metadata (if available)
    maps_url: str | None = None
    website: str | None = None
    phone: str | None = None
    cuisine: str | None = None
    stars: float | None = None
    external_rating: float | None = None
    user_rating_count: int | None = None
    google_place_id: str | None = None
    price_level: int | None = None
    price_min: float | None = None
    price_max: float | None = None
    image_url: str | None = None
    local_image_path: str | None = None
    safety_score: float | None = None

    # Verified weather & marine observations for target date (NULL if unavailable)
    temp_max_c: float | None = None
    temp_min_c: float | None = None
    precipitation_mm: float | None = None
    rain_probability: float | None = None
    uv_index: float | None = None
    wave_height_m: float | None = None
    wave_period_s: float | None = None


class OfferOut(BaseModel):
    kind: str  # dish | room | tour
    name: str
    price: float
    currency: str = "PEN"
    captured_at: datetime


class RecommendationFactorOut(BaseModel):
    name: str
    score: float
    weight: float
    contribution: float
    explanation: str


class PlaceSafetyReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    score: float
    risk_level: str
    incident_count: int
    radius_meters: int = 1000
    shifts: dict[str, int] = Field(default_factory=dict)
    shift_percentages: dict[str, float] = Field(default_factory=dict)
    critical_shift: str
    unsafe_hours: str
    safe_hours: str
    unsafe_dates_notice: str
    top_crimes: list[dict[str, Any]] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    source: str = "MININTER - Sistema de Denuncias Policiales (SIDPOL)"
    evaluated_at: datetime | str


class PlaceDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    osm_id: int
    name: str
    category: PlaceCategory
    kind: PlaceKind
    coast_type: CoastType
    lat: float
    lon: float
    address: str | None = None

    # Commercial contact & hours
    website: str | None = None
    phone: str | None = None
    opening_hours: str | None = None
    cuisine: str | None = None
    stars: float | None = None
    external_rating: float | None = None
    user_rating_count: int | None = None
    google_place_id: str | None = None
    price_level: int | None = None
    price_min: float | None = None
    price_max: float | None = None
    currency: str = "PEN"
    menu_url: str | None = None
    maps_url: str
    image_url: str | None = None
    local_image_path: str | None = None
    reviews: list[PlaceReviewOut] = Field(default_factory=list)
    safety_score: float | None = None
    safety_report: PlaceSafetyReportOut | None = None
    source: str
    fetched_at: datetime | None = None

    # Offers / tariffs snapshots
    offers: list[OfferOut] = Field(default_factory=list)

    # Differentiated index
    convenience_score: float | None = None
    recommendation_score: float | None = None
    score: float | None = None
    confidence: float | None = None
    recommendation_summary: str | None = None
    recommendation_breakdown: list[RecommendationFactorOut] = Field(default_factory=list)


class NearbyPlaceOut(BaseModel):
    place: PlaceOut
    distance_km: float
    recommendation_score: float
    summary: str
    breakdown: list[RecommendationFactorOut]


class FactorBreakdownOut(BaseModel):
    name: str
    value: float
    weight: float
    contribution: float
    data_source: str
    data_date: date
    explanation: str


class ScoreOut(BaseModel):
    place_id: int
    date: date
    score: float
    confidence: float
    breakdown: list[FactorBreakdownOut]
    computed_at: datetime
    weights_version: str


class CalendarDayOut(BaseModel):
    date: date
    score: float
    confidence: float
    breakdown: list[FactorBreakdownOut]


class CalendarResponseOut(BaseModel):
    place_id: int
    date_from: date
    date_to: date
    days: list[CalendarDayOut]


class BestDayOut(BaseModel):
    date: date
    score: float
    confidence: float


class HealthOut(BaseModel):
    status: str
    database: str
    version: str = Field(default="1.0.0")
