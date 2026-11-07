"""Live network verification script for Open-Meteo and OSM Overpass collectors.

Measures actual roundtrip latency, record counts, and database persistence.
"""
from __future__ import annotations

import asyncio
import time

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from turismo.config import Settings
from turismo.infrastructure.collectors.open_meteo import OpenMeteoCollector
from turismo.infrastructure.collectors.osm import OsmCollector
from turismo.infrastructure.db.models import (
    LocationORM,
    MarineDailyORM,
    PlaceORM,
    ScrapeRunORM,
    WeatherDailyORM,
)
from turismo.infrastructure.db.repositories import (
    LocationRepo,
    MarineRepo,
    PlaceRepo,
    ScrapeRunRepo,
    WeatherRepo,
)
from turismo.infrastructure.db.session import create_engine
from turismo.infrastructure.http.client import SafeHttpClient


async def main() -> None:
    settings = Settings()
    engine = create_engine(settings.database_url)
    http_client = SafeHttpClient(settings)

    print("==================================================")
    print("STARTING LIVE NETWORK COLLECTORS VERIFICATION")
    print("==================================================")

    # 1. Open-Meteo Live Collection
    print("\n--- Running Open-Meteo Collector (Live API) ---")
    with Session(engine) as session:
        location_repo = LocationRepo(session)
        weather_repo = WeatherRepo(session)
        marine_repo = MarineRepo(session)
        scrape_repo = ScrapeRunRepo(session)

        meteo_collector = OpenMeteoCollector(
            http_client=http_client,
            location_repo=location_repo,
            weather_repo=weather_repo,
            marine_repo=marine_repo,
            scrape_repo=scrape_repo,
            settings=settings,
        )

        t0 = time.perf_counter()
        meteo_result = await meteo_collector.run()
        meteo_elapsed = time.perf_counter() - t0

        locations_count = session.scalar(select(func.count(LocationORM.id)))
        weather_count = session.scalar(select(func.count(WeatherDailyORM.id)))
        marine_count = session.scalar(select(func.count(MarineDailyORM.id)))

        print(f"Status: {meteo_result.status}")
        print(f"Elapsed Time: {meteo_elapsed:.2f} seconds")
        print(f"Rows Upserted: {meteo_result.rows_upserted}")
        print(f"Rows Rejected: {meteo_result.rows_rejected}")
        print(f"DB Locations: {locations_count}")
        print(f"DB WeatherDaily records: {weather_count}")
        print(f"DB MarineDaily records: {marine_count}")

    # 2. OSM Overpass Live Collection
    print("\n--- Running OSM Overpass Collector (Live API) ---")
    with Session(engine) as session:
        place_repo = PlaceRepo(session)
        scrape_repo = ScrapeRunRepo(session)

        osm_collector = OsmCollector(
            http_client=http_client,
            place_repo=place_repo,
            scrape_repo=scrape_repo,
            settings=settings,
        )

        t0 = time.perf_counter()
        osm_result = await osm_collector.run()
        osm_elapsed = time.perf_counter() - t0

        places_count = session.scalar(select(func.count(PlaceORM.id)))
        hotels_count = session.scalar(
            select(func.count(PlaceORM.id)).where(PlaceORM.category == "hotel")
        )
        attractions_count = session.scalar(
            select(func.count(PlaceORM.id)).where(PlaceORM.category == "attraction")
        )
        restaurants_count = session.scalar(
            select(func.count(PlaceORM.id)).where(PlaceORM.category == "restaurant")
        )

        print(f"Status: {osm_result.status}")
        print(f"Elapsed Time: {osm_elapsed:.2f} seconds")
        print(f"Rows Upserted: {osm_result.rows_upserted}")
        print(f"Rows Rejected: {osm_result.rows_rejected}")
        print(f"DB Total Places: {places_count}")
        print(f"  - Hotels: {hotels_count}")
        print(f"  - Attractions: {attractions_count}")
        print(f"  - Restaurants: {restaurants_count}")

    # 3. Scrape Runs History
    print("\n--- Scrape Runs Recorded ---")
    with Session(engine) as session:
        runs = session.scalars(select(ScrapeRunORM).order_by(ScrapeRunORM.id.desc()).limit(10)).all()
        for r in runs:
            print(
                f"Collector: {r.collector:<12} | Status: {r.status:<7} | "
                f"Upserted: {r.rows_upserted:<4} | Rejected: {r.rows_rejected:<3} | Started: {r.started_at}"
            )

    await http_client.aclose()
    engine.dispose()
    print("\n==================================================")
    print("VERIFICATION COMPLETE")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(main())
