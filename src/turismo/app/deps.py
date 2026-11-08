"""Composition root dependencies wiring all bounded context repositories."""
from __future__ import annotations

from fastapi import Depends
from sqlalchemy.orm import Session

from turismo.events.infrastructure.repository import EventRepo
from turismo.places.infrastructure.repository import PlaceRepo
from turismo.pricing.infrastructure.repository import PriceRepo
from turismo.scoring.application.engine import ScoringService
from turismo.scoring.infrastructure.repository import ScoreRepo, VisitorsRepo
from turismo.shared.config import Settings
from turismo.shared.db import ScrapeRunRepo
from turismo.shared.deps import get_cached_settings, get_db, get_db_engine, limiter
from turismo.weather.infrastructure.repository import LocationRepo, MarineRepo, WeatherRepo

__all__ = [
    "get_cached_settings",
    "get_db",
    "get_db_engine",
    "get_repos",
    "get_scoring_service",
    "limiter",
]


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
