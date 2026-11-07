"""FastAPI dependencies (database sessions, settings, application services)."""
from __future__ import annotations

from collections.abc import Generator
from functools import lru_cache

from fastapi import Depends
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from turismo.application.services import ScoringService
from turismo.config import Settings, get_settings
from turismo.infrastructure.db.repositories import (
    EventRepo,
    LocationRepo,
    MarineRepo,
    PlaceRepo,
    PriceRepo,
    ScoreRepo,
    ScrapeRunRepo,
    VisitorsRepo,
    WeatherRepo,
)
from turismo.infrastructure.db.session import create_engine, make_session_factory


@lru_cache
def get_cached_settings() -> Settings:
    return get_settings()


@lru_cache
def get_db_engine() -> Engine:
    settings = get_cached_settings()
    return create_engine(settings.database_url)


def get_db() -> Generator[Session, None, None]:
    engine = get_db_engine()
    factory = make_session_factory(engine)
    with factory() as session:
        yield session


def get_scoring_service(
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_cached_settings),
) -> ScoringService:
    return ScoringService(
        place_repo=PlaceRepo(session),
        location_repo=LocationRepo(session),
        weather_repo=WeatherRepo(session),
        marine_repo=MarineRepo(session),
        event_repo=EventRepo(session),
        visitors_repo=VisitorsRepo(session),
        price_repo=PriceRepo(session),
        score_repo=ScoreRepo(session),
        weights_path=settings.weights_file,
    )


def get_repos(session: Session = Depends(get_db)) -> dict[str, object]:
    return {
        "place": PlaceRepo(session),
        "location": LocationRepo(session),
        "weather": WeatherRepo(session),
        "marine": MarineRepo(session),
        "event": EventRepo(session),
        "visitors": VisitorsRepo(session),
        "price": PriceRepo(session),
        "score": ScoreRepo(session),
        "scrape": ScrapeRunRepo(session),
    }
