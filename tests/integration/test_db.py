"""Integration tests: full DB round-trip with in-memory SQLite.

No network access. Uses SQLAlchemy create_all() for schema — does not go
through Alembic so the ORM models are the source of truth here.
"""
from __future__ import annotations

from collections.abc import Generator
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from turismo.domain.models import (
    CoastType,
    FactorResult,
    Place,
    PlaceCategory,
    PlaceKind,
    RunResult,
    ScoreResult,
    WeatherDay,
)
from turismo.infrastructure.db.models import Base, LocationORM, PlaceORM
from turismo.infrastructure.db.repositories import (
    PlaceRepo,
    ScoreRepo,
    ScrapeRunRepo,
    WeatherRepo,
)
from turismo.infrastructure.db.session import create_engine

_NOW = datetime(2024, 7, 15, 12, 0, 0, tzinfo=UTC)
_DATE = date(2024, 7, 15)


@pytest.fixture()
def session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        yield s
    # Dispose engine to close all pooled connections and silence ResourceWarnings
    engine.dispose()


@pytest.fixture()
def location_id(session: Session) -> int:
    loc = LocationORM(name="Trujillo", lat=-8.1159, lon=-79.0300, is_coastal=False)
    session.add(loc)
    session.commit()
    session.refresh(loc)
    return loc.id


@pytest.fixture()
def place_id(session: Session, location_id: int) -> int:
    repo = PlaceRepo(session)
    place = Place(
        osm_id=123456,
        name="Hotel Test",
        category=PlaceCategory.HOTEL,
        kind=PlaceKind.LODGING,
        coast_type=CoastType.INLAND,
        lat=-8.1159,
        lon=-79.0300,
        source="test",
    )
    repo.upsert_many([place])
    result = repo.list_all()
    return result[0].osm_id


@pytest.fixture()
def db_place_id(session: Session, location_id: int) -> int:
    repo = PlaceRepo(session)
    place = Place(
        osm_id=654321,
        name="Restaurante Test",
        category=PlaceCategory.RESTAURANT,
        kind=PlaceKind.FOOD,
        coast_type=CoastType.COASTAL,
        lat=-8.0731,
        lon=-79.1200,
        source="test",
    )
    repo.upsert_many([place])
    row = session.scalar(select(PlaceORM).where(PlaceORM.osm_id == 654321))
    assert row is not None
    return row.id


class TestPlaceRepo:
    def test_upsert_and_read_back(self, session: Session, location_id: int) -> None:
        repo = PlaceRepo(session)
        place = Place(
            osm_id=111,
            name="Atracción Test",
            category=PlaceCategory.ATTRACTION,
            kind=PlaceKind.ATTRACTION,
            coast_type=CoastType.INLAND,
            lat=-8.1,
            lon=-79.0,
            source="osm",
        )
        count = repo.upsert_many([place])
        assert count == 1
        places = repo.list_all()
        assert len(places) == 1
        assert places[0].name == "Atracción Test"

    def test_upsert_is_idempotent(self, session: Session, location_id: int) -> None:
        repo = PlaceRepo(session)
        place = Place(
            osm_id=222,
            name="Place A",
            category=PlaceCategory.HOTEL,
            kind=PlaceKind.LODGING,
            coast_type=CoastType.INLAND,
            lat=-8.1,
            lon=-79.0,
            source="osm",
        )
        # Execute same upsert twice
        rows_1 = repo.upsert_many([place])
        rows_2 = repo.upsert_many([place])
        places = repo.list_all()
        # Verify exactly one row exists in database (zero duplicate rows)
        assert rows_1 == 1
        assert rows_2 == 1
        assert len(places) == 1
        assert places[0].osm_id == 222
        assert places[0].name == "Place A"

    def test_filter_by_category(self, session: Session, location_id: int) -> None:
        repo = PlaceRepo(session)
        hotel = Place(
            osm_id=301,
            name="H1",
            category=PlaceCategory.HOTEL,
            kind=PlaceKind.LODGING,
            coast_type=CoastType.INLAND,
            lat=-8.1,
            lon=-79.0,
            source="osm",
        )
        rest = Place(
            osm_id=302,
            name="R1",
            category=PlaceCategory.RESTAURANT,
            kind=PlaceKind.FOOD,
            coast_type=CoastType.INLAND,
            lat=-8.1,
            lon=-79.0,
            source="osm",
        )
        repo.upsert_many([hotel, rest])
        hotels = repo.list_all(category=PlaceCategory.HOTEL)
        assert len(hotels) == 1
        assert hotels[0].category == PlaceCategory.HOTEL


class TestWeatherRepo:
    def test_upsert_and_read_back(self, session: Session, location_id: int) -> None:
        repo = WeatherRepo(session)
        record = WeatherDay(
            location_id=location_id,
            date=_DATE,
            temp_max_c=25.0,
            temp_min_c=18.0,
            precipitation_mm=0.5,
            rain_probability=0.1,
            uv_index=5.0,
            wind_speed_kmh=15.0,
            source="open-meteo",
            fetched_at=_NOW,
        )
        count = repo.upsert_many([record])
        assert count == 1
        result = repo.get_for_location(location_id, _DATE)
        assert result is not None
        assert result.temp_max_c == pytest.approx(25.0)

    def test_upsert_updates_existing(self, session: Session, location_id: int) -> None:
        repo = WeatherRepo(session)
        r1 = WeatherDay(
            location_id=location_id,
            date=_DATE,
            temp_max_c=25.0,
            temp_min_c=18.0,
            precipitation_mm=0.0,
            rain_probability=0.0,
            uv_index=5.0,
            wind_speed_kmh=15.0,
            source="open-meteo",
            fetched_at=_NOW,
        )
        r2 = WeatherDay(
            location_id=location_id,
            date=_DATE,
            temp_max_c=30.0,
            temp_min_c=22.0,  # updated temps
            precipitation_mm=0.0,
            rain_probability=0.0,
            uv_index=5.0,
            wind_speed_kmh=15.0,
            source="open-meteo",
            fetched_at=_NOW,
        )
        repo.upsert_many([r1])
        repo.upsert_many([r2])
        result = repo.get_for_location(location_id, _DATE)
        assert result is not None
        assert result.temp_max_c == pytest.approx(30.0)

    def test_fk_violation_raises(self, session: Session) -> None:
        repo = WeatherRepo(session)
        record = WeatherDay(
            location_id=99999,  # non-existent location
            date=_DATE,
            temp_max_c=25.0,
            temp_min_c=18.0,
            precipitation_mm=0.0,
            rain_probability=0.0,
            uv_index=5.0,
            wind_speed_kmh=15.0,
            source="open-meteo",
            fetched_at=_NOW,
        )
        with pytest.raises((IntegrityError, Exception)):
            repo.upsert_many([record])


class TestScoreRepo:
    def test_upsert_and_get(self, session: Session, db_place_id: int) -> None:
        repo = ScoreRepo(session)
        result = ScoreResult(
            place_id=db_place_id,
            date=_DATE,
            score=72.5,
            confidence=0.85,
            breakdown=[
                FactorResult(
                    name="weather_temperature",
                    value=0.9,
                    weight=3.0,
                    contribution=0.3,
                    data_source="open-meteo",
                    data_date=_DATE,
                    explanation="Temperatura ideal",
                )
            ],
            computed_at=_NOW,
            weights_version="1.0",
        )
        repo.upsert(result, "1.0")
        fetched = repo.get(db_place_id, _DATE)
        assert fetched is not None
        assert fetched.score == pytest.approx(72.5)
        assert fetched.confidence == pytest.approx(0.85)
        assert len(fetched.breakdown) == 1

    def test_get_range(self, session: Session, db_place_id: int) -> None:
        repo = ScoreRepo(session)
        for day in range(3):
            d = date(2024, 7, 15 + day)
            repo.upsert(
                ScoreResult(
                    place_id=db_place_id,
                    date=d,
                    score=60.0 + day,
                    confidence=0.8,
                    breakdown=[],
                    computed_at=_NOW,
                    weights_version="1.0",
                ),
                "1.0",
            )
        results = repo.get_range(db_place_id, date(2024, 7, 15), date(2024, 7, 17))
        assert len(results) == 3
        assert results[0].score == pytest.approx(60.0)

    def test_upsert_score_is_idempotent(self, session: Session, db_place_id: int) -> None:
        repo = ScoreRepo(session)
        result = ScoreResult(
            place_id=db_place_id,
            date=_DATE,
            score=50.0,
            confidence=0.5,
            breakdown=[],
            computed_at=_NOW,
            weights_version="1.0",
        )
        repo.upsert(result, "1.0")
        repo.upsert(result, "1.0")
        results = repo.get_range(db_place_id, _DATE, _DATE)
        assert len(results) == 1


    def test_place_detail_roundtrip_with_google_id_and_image(
        self, session: Session, db_place_id: int
    ) -> None:
        from turismo.domain.models import PlaceDetail, PlaceReview

        repo = PlaceRepo(session)
        detail = PlaceDetail(
            place_id=db_place_id,
            website="https://turismo.pe",
            phone="+51999999999",
            address="Plaza Mayor Trujillo",
            opening_hours="09:00 - 18:00",
            cuisine=None,
            stars=4.8,
            user_rating_count=250,
            price_level=2,
            price_min=50.0,
            price_max=120.0,
            currency="PEN",
            menu_url=None,
            maps_url="https://www.google.com/maps/search/?api=1&query=-8.11,-79.03",
            image_url="/images/places/place_1.webp",
            local_image_path="frontend/public/images/places/place_1.webp",
            google_place_id="ChIJ_TEST_PLACE_ID_123",
            reviews=[
                PlaceReview(
                    author_name="Carlos",
                    rating=5.0,
                    text="Excelente experiencia histórica.",
                )
            ],
            safety_score=92.5,
            source="google_places",
            fetched_at=_NOW,
        )
        repo.upsert_place_detail(detail)

        loaded = repo.get_place_detail(db_place_id)
        assert loaded is not None
        assert loaded.place_id == db_place_id
        assert loaded.google_place_id == "ChIJ_TEST_PLACE_ID_123"
        assert loaded.local_image_path == "frontend/public/images/places/place_1.webp"
        assert loaded.image_url == "/images/places/place_1.webp"
        assert loaded.stars == 4.8
        assert loaded.external_rating == 4.8
        assert loaded.user_rating_count == 250
        assert len(loaded.reviews) == 1
        assert loaded.reviews[0].author_name == "Carlos"


class TestScrapeRunRepo:
    def test_record_and_get_latest(self, session: Session) -> None:
        repo = ScrapeRunRepo(session)
        result = RunResult(
            collector="osm",
            rows_upserted=42,
            rows_rejected=1,
            status="ok",
        )
        repo.record(result, _NOW, _NOW)
        latest = repo.get_latest_by_collector()
        assert "osm" in latest

    def test_multiple_runs_returns_latest(self, session: Session) -> None:
        repo = ScrapeRunRepo(session)
        t1 = datetime(2024, 7, 14, 12, 0, tzinfo=UTC)
        t2 = datetime(2024, 7, 15, 12, 0, tzinfo=UTC)
        for t in [t1, t2]:
            repo.record(
                RunResult(collector="osm", rows_upserted=1, rows_rejected=0, status="ok"),
                t,
                t,
            )
        latest = repo.get_latest_by_collector()
        assert latest["osm"] == t2
