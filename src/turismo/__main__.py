"""CLI entry point for Turismo La Libertad.

Commands:
  python -m turismo migrate        Apply Alembic migrations to head
  python -m turismo api            Start API server in standalone process
  python -m turismo scheduler      Start background scheduler in standalone process
  python -m turismo run            Start API server + scheduler (development only, 1 worker)
  python -m turismo collect <name> Run collector (osm, open_meteo, events, mincetur, hotel_prices)
  python -m turismo score [date]   Compute and persist scores for places (YYYY-MM-DD or today)
"""
from __future__ import annotations

import asyncio
import sys
from collections.abc import Callable
from datetime import UTC, date, datetime

from turismo.config import get_settings


def main() -> None:
    if len(sys.argv) < 2:
        _print_usage()
        sys.exit(1)

    command = sys.argv[1].lower()
    if command == "migrate":
        _run_migrate()
    elif command == "api":
        _run_api()
    elif command == "scheduler":
        _run_scheduler()
    elif command == "run":
        _run_dev_server()
    elif command in ("seed-places-once", "seed"):
        _run_collector("enrich")
    elif command in ("seed-safety", "safety"):
        _run_seed_safety()
    elif command == "collect-images":
        _run_collector("images")
    elif command == "collect":
        if len(sys.argv) < 3:
            print("Error: missing collector name.")
            print("Available collectors: osm, open_meteo, events, mincetur, hotel_prices")
            sys.exit(1)
        _run_collector(sys.argv[2])
    elif command == "score":
        date_arg = sys.argv[2] if len(sys.argv) > 2 else None
        _run_score(date_arg)
    else:
        print(f"Unknown command: {command!r}")
        _print_usage()
        sys.exit(1)


def _print_usage() -> None:
    print(
        "Usage: python -m turismo <migrate | api | scheduler | run | "
        "seed-places-once | collect-images | collect <name> | score [YYYY-MM-DD]>"
    )


def _run_migrate() -> None:
    from alembic import command
    from alembic.config import Config

    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")
    print("Migrations applied successfully to head.")


def _run_api() -> None:
    import uvicorn

    settings = get_settings()
    print(f"Starting standalone Turismo API server on http://{settings.api_host}:{settings.api_port}")
    uvicorn.run(
        "turismo.interfaces.api.main:app",
        host=settings.api_host,
        port=settings.api_port,
        log_level=settings.log_level.lower(),
    )


def _run_scheduler() -> None:
    from turismo.interfaces.scheduler import create_scheduler

    settings = get_settings()
    scheduler = create_scheduler(settings)
    scheduler.start()
    print("Turismo background scheduler running. Press Ctrl+C to stop.")

    async def _keep_alive() -> None:
        stop_event = asyncio.Event()
        try:
            await stop_event.wait()
        except (KeyboardInterrupt, SystemExit):
            pass
        finally:
            scheduler.shutdown()

    try:
        asyncio.run(_keep_alive())
    except (KeyboardInterrupt, SystemExit):
        print("Scheduler stopped.")


def _run_dev_server() -> None:
    import uvicorn

    from turismo.interfaces.scheduler import create_scheduler

    print(
        "ADVERTENCIA: 'run' es solo para desarrollo (1 worker). "
        "En producción ejecuta 'python -m turismo api' y 'python -m turismo scheduler' "
        "en procesos separados."
    )
    settings = get_settings()
    scheduler = create_scheduler(settings)
    scheduler.start()
    print(f"Starting Turismo development server on http://{settings.api_host}:{settings.api_port}")
    try:
        uvicorn.run(
            "turismo.interfaces.api.main:app",
            host=settings.api_host,
            port=settings.api_port,
            log_level=settings.log_level.lower(),
        )
    finally:
        scheduler.shutdown()


def _run_seed_safety() -> None:
    settings = get_settings()
    from turismo.infrastructure.collectors.mininter import seed_places_safety_snapshot
    from turismo.infrastructure.db.session import create_engine, make_session_factory

    engine = create_engine(settings.database_url)
    factory = make_session_factory(engine)
    print("Iniciando evaluación de seguridad georreferenciada MININTER / SIDPOL...")
    try:
        with factory() as session:
            count = seed_places_safety_snapshot(session=session)
            print(
                f"Completado exitosamente: {count} lugares actualizados con diagnóstico oficial."
            )
    finally:
        engine.dispose()


def _run_collector(name: str) -> None:
    async def _execute() -> None:
        settings = get_settings()
        from turismo.infrastructure.collectors.base import BaseCollector
        from turismo.infrastructure.collectors.enricher import CommercialEnricher
        from turismo.infrastructure.collectors.events import EventsCollector
        from turismo.infrastructure.collectors.hotel_prices import HotelPricesCollector
        from turismo.infrastructure.collectors.image_collector import ImageCollector
        from turismo.infrastructure.collectors.mincetur import MinceturCollector
        from turismo.infrastructure.collectors.open_meteo import OpenMeteoCollector
        from turismo.infrastructure.collectors.osm import OsmCollector
        from turismo.infrastructure.db.repositories import (
            EventRepo,
            LocationRepo,
            MarineRepo,
            PlaceRepo,
            PriceRepo,
            ScrapeRunRepo,
            VisitorsRepo,
            WeatherRepo,
        )
        from turismo.infrastructure.db.session import create_engine, make_session_factory
        from turismo.infrastructure.http.client import SafeHttpClient

        engine = create_engine(settings.database_url)
        factory = make_session_factory(engine)
        http_client = SafeHttpClient(settings)

        try:
            with factory() as session:
                scrape_repo = ScrapeRunRepo(session)
                place_repo = PlaceRepo(session)

                collectors: dict[str, Callable[[], BaseCollector]] = {
                    "osm": lambda: OsmCollector(http_client, place_repo, scrape_repo, settings),
                    "open_meteo": lambda: OpenMeteoCollector(
                        http_client,
                        LocationRepo(session),
                        WeatherRepo(session),
                        MarineRepo(session),
                        scrape_repo,
                        settings,
                    ),
                    "events": lambda: EventsCollector(
                        EventRepo(session), scrape_repo, settings.events_file
                    ),
                    "mincetur": lambda: MinceturCollector(
                        place_repo, VisitorsRepo(session), scrape_repo, settings, http_client
                    ),
                    "hotel_prices": lambda: HotelPricesCollector(
                        place_repo, PriceRepo(session), scrape_repo, settings
                    ),
                    "enrich": lambda: CommercialEnricher(
                        place_repo=place_repo,
                        scrape_repo=scrape_repo,
                        http_client=http_client,
                        google_places_api_key=settings.google_places_api_key,
                    ),
                    "images": lambda: ImageCollector(
                        place_repo=place_repo,
                        scrape_repo=scrape_repo,
                    ),
                }

                c_factory = collectors.get(name.lower())
                if not c_factory:
                    print(f"Error: Unknown collector '{name}'.")
                    print(f"Available collectors: {list(collectors.keys())}")
                    sys.exit(1)

                collector = c_factory()
                print(f"Running collector '{collector.name}'...")
                res = await collector.run()
                print(
                    f"Result: status={res.status}, "
                    f"upserted={res.rows_upserted}, rejected={res.rows_rejected}"
                )
                if res.error:
                    print(f"Message: {res.error}")
        finally:
            await http_client.aclose()
            engine.dispose()

    asyncio.run(_execute())


def _run_score(date_str: str | None) -> None:
    settings = get_settings()
    from turismo.application.services import ScoringService
    from turismo.infrastructure.db.repositories import (
        EventRepo,
        LocationRepo,
        MarineRepo,
        PlaceRepo,
        PriceRepo,
        ScoreRepo,
        VisitorsRepo,
        WeatherRepo,
    )
    from turismo.infrastructure.db.session import create_engine, make_session_factory
    from turismo.interfaces.api.cache import invalidate_api_cache

    target_date: date
    if date_str:
        try:
            target_date = date.fromisoformat(date_str)
        except ValueError:
            print(f"Error: invalid date format '{date_str}'. Expected YYYY-MM-DD.")
            sys.exit(1)
    else:
        target_date = datetime.now(tz=UTC).date()

    engine = create_engine(settings.database_url)
    factory = make_session_factory(engine)
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
            print(f"Computing scores for {target_date}...")
            scores = service.compute_scores(query_date=target_date)
            print(f"Computed scores for {len(scores)} places.")
            for s in scores[:5]:
                conf_pct = s.confidence * 100
                print(f"  Place ID {s.place_id}: Score {s.score:.1f} (Conf: {conf_pct:.1f}%)")
            invalidated = invalidate_api_cache()
            if invalidated > 0:
                print(f"Invalidated {invalidated} cached API responses.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
