"""Unit tests for the modular places bounded context."""
from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from turismo.places.api import router as places_router
from turismo.places.domain.classification import classify_place
from turismo.places.domain.models import CoastType, Place, PlaceCategory, PlaceKind
from turismo.places.infrastructure.repository import PlaceRepo
from turismo.weather.infrastructure.models import (
    LocationORM,
    MarineDailyORM,
    WeatherDailyORM,
)


def test_places_domain_classification_and_entity() -> None:
    kind = classify_place(
        tags={"historic": "archaeological_site"},
        source="osm",
        category="attraction",
    )
    assert kind == PlaceKind.ATTRACTION

    place = Place(
        id=1,
        osm_id=999,
        name="Huacas del Sol y de la Luna",
        category=PlaceCategory.ATTRACTION,
        kind=kind,
        coast_type=CoastType.INLAND,
        lat=-8.135,
        lon=-78.991,
        source="osm",
    )
    assert place.kind == PlaceKind.ATTRACTION


def test_places_router_exposes_expected_endpoints() -> None:
    paths = {getattr(route, "path", "") for route in places_router.routes}
    assert "/places" in paths
    assert "/places/{place_id}" in paths
    assert "/places/{place_id}/nearby" in paths


def test_place_repo_parses_sqlite_weather_and_marine_dates() -> None:
    engine = create_engine("sqlite:///:memory:")
    LocationORM.__table__.create(engine)
    WeatherDailyORM.__table__.create(engine)
    MarineDailyORM.__table__.create(engine)
    target_date = date(2026, 11, 8)
    fetched_at = datetime(2026, 11, 4, 4, 5, 14, 350989, tzinfo=UTC)

    try:
        with Session(engine) as session:
            session.add(LocationORM(id=1, name="Trujillo", lat=-8.1, lon=-79.0, is_coastal=True))
            session.add(
                WeatherDailyORM(
                    location_id=1,
                    date=target_date,
                    temp_max_c=25,
                    temp_min_c=18,
                    precipitation_mm=0,
                    rain_probability=0,
                    uv_index=5,
                    wind_speed_kmh=10,
                    source="test",
                    fetched_at=fetched_at,
                )
            )
            session.add(
                MarineDailyORM(
                    location_id=1,
                    date=target_date,
                    wave_height_m=1.2,
                    wave_period_s=8,
                    source="test",
                    fetched_at=fetched_at,
                )
            )
            session.commit()

            repo = PlaceRepo(session)
            weather = repo.get_weather_for_location(1, target_date)
            marine = repo.get_marine_for_location(1, target_date)

            assert weather is not None
            assert weather.date == target_date
            assert isinstance(weather.fetched_at, datetime)
            assert marine is not None
            assert marine.date == target_date
            assert isinstance(marine.fetched_at, datetime)
    finally:
        engine.dispose()
