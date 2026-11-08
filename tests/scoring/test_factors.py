"""Unit tests for modular ScoreFactor implementations and ScoringEngine."""
from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import yaml

from turismo.scoring.application.engine import ScoringEngine
from turismo.scoring.domain.factors import (
    DEFAULT_FACTORS,
    CalendarFactor,
    ExternalRatingFactor,
    MarineFactor,
    PlaceDayContext,
    PriceFactor,
    SafetyFactor,
    ScoreFactor,
    SeasonalityFactor,
    WeatherFactor,
)
from turismo.shared.models import (
    CoastType,
    MarineDay,
    Place,
    PlaceCategory,
    PlaceDetail,
    PlaceKind,
    VisitorsMonth,
    WeatherDay,
)


def _sample_context(
    *,
    coastal: bool = True,
    category: PlaceCategory = PlaceCategory.ATTRACTION,
) -> PlaceDayContext:
    raw: dict[str, Any] = yaml.safe_load(
        Path("src/turismo/scoring/weights.yaml").read_text(encoding="utf-8")
    )
    now = datetime(2026, 7, 15, 12, 0, tzinfo=UTC)
    target_date = date(2026, 7, 15)  # Wednesday
    place = Place(
        id=1,
        osm_id=1001,
        name="Balneario de Huanchaco",
        category=category,
        kind=PlaceKind.LODGING if category == PlaceCategory.HOTEL else PlaceKind.ATTRACTION,
        coast_type=CoastType.COASTAL if coastal else CoastType.INLAND,
        lat=-8.0792,
        lon=-79.1214,
        source="osm",
    )
    weather = WeatherDay(
        location_id=1,
        date=target_date,
        temp_max_c=23.0,
        temp_min_c=19.0,
        precipitation_mm=0.0,
        rain_probability=0.05,
        uv_index=6.0,
        wind_speed_kmh=14.0,
        source="open-meteo",
        fetched_at=now,
    )
    marine = (
        MarineDay(
            location_id=1,
            date=target_date,
            wave_height_m=1.2,
            wave_period_s=12.0,
            source="open-meteo",
            fetched_at=now,
        )
        if coastal
        else None
    )
    visitors = VisitorsMonth(
        place_id=1,
        year=2026,
        month=7,
        visitors=12000,
        source="mincetur",
        fetched_at=now,
    )
    detail = PlaceDetail(
        place_id=1,
        maps_url="https://maps.google.com/?q=-8.0792,-79.1214",
        stars=4.6,
        user_rating_count=420,
        price_min=75.0,
        safety_score=85.0,
        source="google_places",
        fetched_at=now,
    )
    categories: dict[str, Any] = raw["categories"]
    cat_cfg = dict(categories[category.value])
    thresholds: dict[str, Any] = dict(cat_cfg.get("thresholds", {}))
    return PlaceDayContext(
        place=place,
        query_date=target_date,
        category_config=cat_cfg,
        coastal_override=categories["coastal_override"] if coastal else {},
        thresholds=thresholds,
        weather_day=weather,
        marine_day=marine,
        max_crowd_level=2,
        is_weekend=False,
        visitors_month=visitors,
        annual_avg_visitors=12000.0,
        price_median=(80.0, 8),
        place_detail=detail,
    )


def test_all_default_factors_satisfy_score_factor_protocol() -> None:
    assert len(DEFAULT_FACTORS) == 7
    for factor in DEFAULT_FACTORS:
        assert isinstance(factor, ScoreFactor)
        assert isinstance(factor.name, str) and len(factor.name) > 0


def test_each_factor_computes_normalized_scores() -> None:
    ctx_attraction = _sample_context(coastal=True, category=PlaceCategory.ATTRACTION)
    for factor in (
        WeatherFactor(),
        MarineFactor(),
        CalendarFactor(),
        SeasonalityFactor(),
        SafetyFactor(),
        ExternalRatingFactor(),
    ):
        results = factor.compute(ctx_attraction)
        assert len(results) >= 1
        for r in results:
            assert 0.0 <= r.normalized_value <= 1.0
            assert r.weight > 0.0

    ctx_hotel = _sample_context(coastal=True, category=PlaceCategory.HOTEL)
    price_results = PriceFactor().compute(ctx_hotel)
    assert len(price_results) == 1
    assert 0.0 <= price_results[0].normalized_value <= 1.0


def test_marine_factor_omitted_for_inland_place() -> None:
    ctx = _sample_context(coastal=False)
    assert MarineFactor().compute(ctx) == []


def test_scoring_engine_iterates_registered_factors() -> None:
    ctx = _sample_context(coastal=True, category=PlaceCategory.ATTRACTION)
    engine = ScoringEngine(factors=DEFAULT_FACTORS)
    result = engine.evaluate(
        ctx=ctx,
        weights_version="v1.0",
        now_utc=datetime(2026, 7, 15, 12, 0, tzinfo=UTC),
    )
    names = {f.name for f in result.breakdown}
    assert {
        "weather_temperature",
        "weather_rain",
        "weather_uv",
        "weather_wind",
        "marine_wave_height",
        "marine_wave_period",
        "calendar_weekend",
        "calendar_crowd",
        "seasonality",
        "safety",
        "external_rating",
    }.issubset(names)
    assert 0.0 < result.score <= 100.0
    assert result.confidence == 1.0
