"""Composition root background job scheduler using APScheduler."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from turismo.events.infrastructure.events_collector import EventsCollector
from turismo.events.infrastructure.repository import EventRepo
from turismo.places.infrastructure.osm_collector import OsmCollector
from turismo.places.infrastructure.repository import PlaceRepo
from turismo.pricing.infrastructure.repository import PriceRepo
from turismo.scoring.application.engine import ScoringService
from turismo.scoring.infrastructure.mincetur_collector import MinceturCollector
from turismo.scoring.infrastructure.repository import ScoreRepo, VisitorsRepo
from turismo.shared.cache import invalidate_api_cache
from turismo.shared.config import Settings, get_settings
from turismo.shared.db import ScrapeRunRepo, create_engine, make_session_factory
from turismo.shared.http import SafeHttpClient
from turismo.weather.infrastructure.open_meteo_collector import OpenMeteoCollector
from turismo.weather.infrastructure.repository import LocationRepo, MarineRepo, WeatherRepo

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

    scheduler.add_job(
        job_open_meteo,
        trigger=IntervalTrigger(hours=6),
        args=[cfg],
        id="job_open_meteo",
        name="Open-Meteo Weather Collection",
        replace_existing=True,
    )

    scheduler.add_job(
        job_osm,
        trigger=CronTrigger(day_of_week="sun", hour=3, minute=0),
        args=[cfg],
        id="job_osm",
        name="OSM Places Collection",
        replace_existing=True,
    )

    scheduler.add_job(
        job_events,
        trigger=CronTrigger(day_of_week="mon", hour=2, minute=0),
        args=[cfg],
        id="job_events",
        name="Events Collection",
        replace_existing=True,
    )

    scheduler.add_job(
        job_mincetur,
        trigger=CronTrigger(day=1, hour=4, minute=0),
        args=[cfg],
        id="job_mincetur",
        name="MINCETUR Monthly Visitors Collection",
        replace_existing=True,
    )

    scheduler.add_job(
        job_compute_scores,
        trigger=CronTrigger(hour=5, minute=0),
        args=[cfg],
        id="job_compute_scores",
        name="Daily Tourism Scoring",
        replace_existing=True,
    )

    return scheduler
