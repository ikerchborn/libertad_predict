"""Background job scheduler using APScheduler.

Orchestrates periodic collection and daily score recomputation.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from turismo.application.services import ScoringService
from turismo.config import Settings, get_settings
from turismo.infrastructure.collectors.events import EventsCollector
from turismo.infrastructure.collectors.mincetur import MinceturCollector
from turismo.infrastructure.collectors.open_meteo import OpenMeteoCollector
from turismo.infrastructure.collectors.osm import OsmCollector
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
from turismo.infrastructure.http.client import SafeHttpClient
from turismo.interfaces.api.cache import invalidate_api_cache

logger = structlog.get_logger(__name__)


async def job_open_meteo(settings: Settings) -> None:
    logger.info("Starting scheduled open_meteo job")
    engine = create_engine(settings.database_url)
    factory = make_session_factory(engine)
    http_client = SafeHttpClient(settings)
    try:
        with factory() as session:
            collector = OpenMeteoCollector(
                http_client,
                LocationRepo(session),
                WeatherRepo(session),
                MarineRepo(session),
                ScrapeRunRepo(session),
                settings,
            )
            await collector.run()
    finally:
        await http_client.aclose()
        engine.dispose()


async def job_osm(settings: Settings) -> None:
    logger.info("Starting scheduled osm job")
    engine = create_engine(settings.database_url)
    factory = make_session_factory(engine)
    http_client = SafeHttpClient(settings)
    try:
        with factory() as session:
            collector = OsmCollector(
                http_client,
                PlaceRepo(session),
                ScrapeRunRepo(session),
                settings,
            )
            await collector.run()
    finally:
        await http_client.aclose()
        engine.dispose()


async def job_events(settings: Settings) -> None:
    logger.info("Starting scheduled events job")
    engine = create_engine(settings.database_url)
    factory = make_session_factory(engine)
    try:
        with factory() as session:
            collector = EventsCollector(
                EventRepo(session),
                ScrapeRunRepo(session),
                settings.events_file,
            )
            await collector.run()
    finally:
        engine.dispose()


async def job_mincetur(settings: Settings) -> None:
    logger.info("Starting scheduled mincetur job")
    engine = create_engine(settings.database_url)
    factory = make_session_factory(engine)
    http_client = SafeHttpClient(settings)
    try:
        with factory() as session:
            collector = MinceturCollector(
                PlaceRepo(session),
                VisitorsRepo(session),
                ScrapeRunRepo(session),
                settings,
                http_client,
            )
            await collector.run()
    finally:
        await http_client.aclose()
        engine.dispose()


async def job_compute_scores(settings: Settings) -> None:
    """Precompute scores for all places for the next 16 days."""
    logger.info("Starting scheduled compute_scores job")
    engine = create_engine(settings.database_url)
    factory = make_session_factory(engine)
    today = datetime.now(tz=UTC).date()
    try:
        with factory() as session:
            service = ScoringService(
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
            for i in range(16):
                day = today + timedelta(days=i)
                service.compute_scores(query_date=day)
            invalidate_api_cache()
            logger.info("Invalidated API read cache following score computation")
    finally:
        engine.dispose()


def create_scheduler(settings: Settings | None = None) -> AsyncIOScheduler:
    cfg = settings or get_settings()
    scheduler = AsyncIOScheduler()

    # Weather: every 6 hours
    scheduler.add_job(
        job_open_meteo,
        trigger=IntervalTrigger(hours=6),
        args=[cfg],
        id="job_open_meteo",
        name="Open-Meteo Weather Collection",
        replace_existing=True,
    )

    # OSM: weekly on Sunday at 03:00
    scheduler.add_job(
        job_osm,
        trigger=CronTrigger(day_of_week="sun", hour=3, minute=0),
        args=[cfg],
        id="job_osm",
        name="OSM Places Collection",
        replace_existing=True,
    )

    # Events: weekly on Monday at 02:00
    scheduler.add_job(
        job_events,
        trigger=CronTrigger(day_of_week="mon", hour=2, minute=0),
        args=[cfg],
        id="job_events",
        name="Events Collection",
        replace_existing=True,
    )

    # MINCETUR: monthly on day 1 at 04:00
    scheduler.add_job(
        job_mincetur,
        trigger=CronTrigger(day=1, hour=4, minute=0),
        args=[cfg],
        id="job_mincetur",
        name="MINCETUR Monthly Visitors Collection",
        replace_existing=True,
    )

    # Scoring: daily at 05:00
    scheduler.add_job(
        job_compute_scores,
        trigger=CronTrigger(hour=5, minute=0),
        args=[cfg],
        id="job_compute_scores",
        name="Daily Tourism Scoring",
        replace_existing=True,
    )

    return scheduler
