"""Integration tests for hardened FastAPI endpoints.

Verifies:
1. Health check returns 200.
2. Places list pagination & score join in single query (avoids N+1).
3. Scores endpoint is strictly read-only: returns 404 if not precomputed.
4. Calendar endpoint returns daily breakdown for indexed range (max 30 days).
5. In-memory response cache sets Cache-Control, ETag, and returns 304 on If-None-Match.
6. Cache invalidation clears cached responses.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator, Generator
from datetime import UTC, date, datetime
from pathlib import Path

import httpx
import pytest
from sqlalchemy import Engine, event
from sqlalchemy import create_engine as sa_create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from turismo.config import Settings
from turismo.domain.models import (
    CoastType,
    FactorResult,
    Place,
    PlaceCategory,
    PlaceKind,
    ScoreResult,
)
from turismo.infrastructure.db.models import Base
from turismo.infrastructure.db.repositories import LocationRepo, PlaceRepo, ScoreRepo
from turismo.interfaces.api.cache import invalidate_api_cache
from turismo.interfaces.api.deps import get_cached_settings, get_db
from turismo.interfaces.api.main import create_app

_DATE_1 = date(2026, 7, 15)
_DATE_2 = date(2026, 7, 16)
_NOW = datetime(2026, 7, 1, 12, 0, tzinfo=UTC)


@pytest.fixture()
def test_engine() -> Generator[Engine, None, None]:
    engine = sa_create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def app_with_db(test_engine: Engine) -> object:
    invalidate_api_cache()

    with Session(test_engine) as session:
        place_repo = PlaceRepo(session)
        place_repo.upsert_many(
            [
                Place(
                    osm_id=9001,
                    name="Chan Chan Patrimonio",
                    category=PlaceCategory.ATTRACTION,
                    coast_type=CoastType.INLAND,
                    lat=-8.1159,
                    lon=-79.0300,
                    source="manual",
                    kind=PlaceKind.ATTRACTION,
                ),
                Place(
                    osm_id=9002,
                    name="Huaca del Dragón",
                    category=PlaceCategory.ATTRACTION,
                    coast_type=CoastType.INLAND,
                    lat=-8.0900,
                    lon=-79.0500,
                    source="osm",
                    kind=PlaceKind.ATTRACTION,
                ),
            ]
        )

        location_repo = LocationRepo(session)
        location_repo.ensure_locations(
            [
                {"name": "Trujillo", "lat": -8.1159, "lon": -79.0300, "is_coastal": False},
            ]
        )

        # Precompute a score for place 1 on _DATE_1
        score_repo = ScoreRepo(session)
        score_repo.upsert(
            ScoreResult(
                place_id=1,
                date=_DATE_1,
                score=82.5,
                confidence=0.9,
                breakdown=[
                    FactorResult(
                        name="weather_temperature",
                        value=0.85,
                        weight=3.0,
                        contribution=0.35,
                        data_source="open_meteo",
                        data_date=_DATE_1,
                        explanation="Temperatura ideal 22°C",
                    )
                ],
                computed_at=_NOW,
                weights_version="1.0",
            ),
            "1.0",
        )
        score_repo.upsert(
            ScoreResult(
                place_id=1,
                date=_DATE_2,
                score=85.0,
                confidence=0.95,
                breakdown=[],
                computed_at=_NOW,
                weights_version="1.0",
            ),
            "1.0",
        )

    custom_settings = Settings(
        database_url="sqlite://",
        weights_file=Path("config/weights.yaml"),
        events_file=Path("config/events.yaml"),
    )

    app = create_app(custom_settings)

    def override_get_db() -> Generator[Session, None, None]:
        with Session(test_engine) as s:
            yield s

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_cached_settings] = lambda: custom_settings

    return app


@pytest.fixture()
async def client(app_with_db: object) -> AsyncGenerator[httpx.AsyncClient, None]:
    transport = httpx.ASGITransport(app=app_with_db)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_health_check(client: httpx.AsyncClient) -> None:
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["database"] == "ok"


@pytest.mark.asyncio
async def test_list_places_pagination_and_scores(client: httpx.AsyncClient) -> None:
    resp = await client.get("/places?limit=10&offset=0&query_date=2026-07-15")
    assert resp.status_code == 200
    places = resp.json()
    assert len(places) == 2

    # Place 1 (attraction) has precomputed convenience_score for 2026-07-15
    p1 = next(p for p in places if p["id"] == 1)
    assert p1["kind"] == "attraction"
    assert p1["score"] == pytest.approx(82.5)
    assert p1["convenience_score"] == pytest.approx(82.5)
    assert p1["confidence"] == pytest.approx(0.9)

    # Place 2 (attraction) has no precomputed score for that day -> score is None
    p2 = next(p for p in places if p["id"] == 2)
    assert p2["kind"] == "attraction"
    assert p2["score"] is None
    assert p2["convenience_score"] is None


@pytest.mark.asyncio
async def test_places_enrichment_queries_are_batched(
    client: httpx.AsyncClient, test_engine: Engine
) -> None:
    statements: list[str] = []

    def record_statement(
        _connection: object,
        _cursor: object,
        statement: str,
        _parameters: object,
        _context: object,
        _executemany: bool,
    ) -> None:
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement.lower())

    event.listen(test_engine, "before_cursor_execute", record_statement)
    try:
        response = await client.get("/places?limit=10&q=Chan&query_date=2026-07-15")
    finally:
        event.remove(test_engine, "before_cursor_execute", record_statement)

    assert response.status_code == 200
    assert len(response.json()) == 1
    for table_name in ("place_details", "weather_daily", "marine_daily"):
        matching_queries = [statement for statement in statements if table_name in statement]
        assert len(matching_queries) <= 1


@pytest.mark.asyncio
async def test_places_reject_unknown_zone_filter(client: httpx.AsyncClient) -> None:
    response = await client.get("/places?zone=unknown")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_score_readonly_no_onthefly_calc(client: httpx.AsyncClient) -> None:
    # 1. Existing precomputed score returns 200
    resp_ok = await client.get(f"/scores/1?query_date={_DATE_1.isoformat()}")
    assert resp_ok.status_code == 200
    assert resp_ok.json()["score"] == pytest.approx(82.5)

    # 2. Missing precomputed score returns 404 (does NOT calculate on the fly)
    resp_missing = await client.get("/scores/1?query_date=2026-12-31")
    assert resp_missing.status_code == 404
    assert "No hay score precalculado" in resp_missing.json()["detail"]


@pytest.mark.asyncio
async def test_calendar_endpoint(client: httpx.AsyncClient) -> None:
    # Query valid 2-day range
    resp = await client.get(
        f"/calendar?place_id=1&from={_DATE_1.isoformat()}&to={_DATE_2.isoformat()}"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["place_id"] == 1
    assert len(data["days"]) == 2
    assert data["days"][0]["date"] == _DATE_1.isoformat()
    assert data["days"][0]["score"] == pytest.approx(82.5)
    assert len(data["days"][0]["breakdown"]) == 1

    # Over 30 days range returns 400
    resp_over_30 = await client.get(
        "/calendar?place_id=1&from=2026-07-01&to=2026-08-10"
    )
    assert resp_over_30.status_code == 400
    assert "30 días" in resp_over_30.json()["detail"]

    # Non-existent place returns 404
    resp_404 = await client.get(
        "/calendar?place_id=99999&from=2026-07-01&to=2026-07-05"
    )
    assert resp_404.status_code == 404


@pytest.mark.asyncio
async def test_response_cache_etag_and_invalidation(client: httpx.AsyncClient) -> None:
    # First request: 200 with ETag and Cache-Control
    resp1 = await client.get("/places?limit=5")
    assert resp1.status_code == 200
    etag = resp1.headers.get("etag")
    assert etag is not None
    assert "public, max-age=" in resp1.headers.get("cache-control", "")

    # Second request with If-None-Match returns 304
    resp2 = await client.get("/places?limit=5", headers={"If-None-Match": etag})
    assert resp2.status_code == 304

    # Invalidate cache
    count = invalidate_api_cache()
    assert count > 0

    # Request after invalidation returns fresh 200
    resp3 = await client.get("/places?limit=5")
    assert resp3.status_code == 200
