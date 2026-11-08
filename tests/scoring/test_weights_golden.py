"""Golden regression test for weights.yaml.

Any change to weights or thresholds in weights.yaml alters the deterministic
convenience scores below, making the numerical impact immediately visible in PRs.
"""
from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import yaml

from turismo.scoring.application.engine import ScoringEngine
from turismo.scoring.domain.factors import PlaceDayContext
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


def test_weights_yaml_files_are_in_sync() -> None:
    root_weights = Path("config/weights.yaml").read_text(encoding="utf-8")
    module_weights = Path("src/turismo/scoring/weights.yaml").read_text(encoding="utf-8")
    assert root_weights == module_weights


def test_golden_scores_for_canonical_places_and_dates() -> None:
    raw: dict[str, Any] = yaml.safe_load(
        Path("src/turismo/scoring/weights.yaml").read_text(encoding="utf-8")
    )
    categories: dict[str, Any] = raw["categories"]
    attraction_cfg: dict[str, Any] = categories["attraction"]
    thresholds: dict[str, Any] = attraction_cfg["thresholds"]
    version = str(raw["version"])
    engine = ScoringEngine()

    now = datetime(2026, 7, 18, 12, 0, tzinfo=UTC)
    saturday = date(2026, 7, 18)

    # Case 1: Coastal attraction on a sunny Saturday with mild waves and no crowd event
    huanchaco = Place(
        id=10,
        osm_id=20010,
        name="Playa Huanchaco",
        category=PlaceCategory.ATTRACTION,
        kind=PlaceKind.ATTRACTION,
        coast_type=CoastType.COASTAL,
        lat=-8.0792,
        lon=-79.1214,
        source="osm",
    )
    ctx_huanchaco = PlaceDayContext(
        place=huanchaco,
        query_date=saturday,
        category_config=attraction_cfg,
        coastal_override=categories["coastal_override"],
        thresholds=thresholds,
        weather_day=WeatherDay(
            location_id=2,
            date=saturday,
            temp_max_c=22.0,
            temp_min_c=18.0,
            precipitation_mm=0.0,
            rain_probability=0.0,
            uv_index=6.0,
            wind_speed_kmh=12.0,
            source="open-meteo",
            fetched_at=now,
        ),
        marine_day=MarineDay(
            location_id=2,
            date=saturday,
            wave_height_m=1.2,
            wave_period_s=11.0,
            source="open-meteo",
            fetched_at=now,
        ),
        max_crowd_level=0,
        is_weekend=True,
        visitors_month=VisitorsMonth(
            place_id=10,
            year=2026,
            month=7,
            visitors=9000,
            source="mincetur",
            fetched_at=now,
        ),
        annual_avg_visitors=10000.0,
        price_median=None,
        place_detail=PlaceDetail(
            place_id=10,
            maps_url="https://maps.google.com/?q=-8.0792,-79.1214",
            stars=4.5,
            user_rating_count=1200,
            safety_score=80.0,
            source="google_places",
            fetched_at=now,
        ),
    )
    res_1 = engine.evaluate(ctx_huanchaco, weights_version=version, now_utc=now)

    assert res_1.score == 81.07
    assert res_1.confidence == 1.0

    # Case 2: Inland cultural attraction during high-crowd festival on a weekday
    weekday = date(2026, 9, 24)
    chan_chan = Place(
        id=20,
        osm_id=20020,
        name="Complejo Arqueológico Chan Chan",
        category=PlaceCategory.ATTRACTION,
        kind=PlaceKind.ATTRACTION,
        coast_type=CoastType.INLAND,
        lat=-8.1058,
        lon=-79.0747,
        source="osm",
    )
    ctx_chan_chan = PlaceDayContext(
        place=chan_chan,
        query_date=weekday,
        category_config=attraction_cfg,
        coastal_override={},
        thresholds=thresholds,
        weather_day=WeatherDay(
            location_id=1,
            date=weekday,
            temp_max_c=24.0,
            temp_min_c=17.0,
            precipitation_mm=0.0,
            rain_probability=0.10,
            uv_index=8.0,
            wind_speed_kmh=16.0,
            source="open-meteo",
            fetched_at=now,
        ),
        marine_day=None,
        max_crowd_level=4,
        is_weekend=False,
        visitors_month=VisitorsMonth(
            place_id=20,
            year=2026,
            month=9,
            visitors=18000,
            source="mincetur",
            fetched_at=now,
        ),
        annual_avg_visitors=10000.0,
        price_median=None,
        place_detail=PlaceDetail(
            place_id=20,
            maps_url="https://maps.google.com/?q=-8.1058,-79.0747",
            stars=4.8,
            user_rating_count=3500,
            safety_score=75.0,
            source="google_places",
            fetched_at=now,
        ),
    )
    res_2 = engine.evaluate(ctx_chan_chan, weights_version=version, now_utc=now)

    assert res_2.score == 69.94
    assert res_2.confidence == 1.0
