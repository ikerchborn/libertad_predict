"""SQLAlchemy repositories for locations, weather, and marine observations."""
from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from turismo.shared.db import upsert_stmt
from turismo.shared.geo import LocationInfo
from turismo.shared.models import MarineDay, WeatherDay
from turismo.weather.infrastructure.models import LocationORM, MarineDailyORM, WeatherDailyORM


class WeatherRepo:
    def __init__(self, session: Session) -> None:
        self._session = session

    def upsert_many(self, records: list[WeatherDay]) -> int:
        if not records:
            return 0
        rows = [
            {
                "location_id": r.location_id,
                "date": r.date,
                "temp_max_c": r.temp_max_c,
                "temp_min_c": r.temp_min_c,
                "precipitation_mm": r.precipitation_mm,
                "rain_probability": r.rain_probability,
                "uv_index": r.uv_index,
                "wind_speed_kmh": r.wind_speed_kmh,
                "source": r.source,
                "fetched_at": r.fetched_at,
            }
            for r in records
        ]
        stmt = upsert_stmt(self._session, WeatherDailyORM).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["location_id", "date"],
            set_={k: stmt.excluded[k] for k in rows[0] if k not in ("location_id", "date")},
        )
        self._session.execute(stmt)
        self._session.commit()
        return len(rows)

    def get_for_location(self, location_id: int, date: date) -> WeatherDay | None:
        row = self._session.scalar(
            select(WeatherDailyORM).where(
                WeatherDailyORM.location_id == location_id,
                WeatherDailyORM.date == date,
            )
        )
        if not row:
            return None
        return WeatherDay(
            location_id=row.location_id,
            date=row.date,
            temp_max_c=float(row.temp_max_c),
            temp_min_c=float(row.temp_min_c),
            precipitation_mm=float(row.precipitation_mm),
            rain_probability=float(row.rain_probability),
            uv_index=float(row.uv_index),
            wind_speed_kmh=float(row.wind_speed_kmh),
            source=row.source,
            fetched_at=row.fetched_at,
        )


class MarineRepo:
    def __init__(self, session: Session) -> None:
        self._session = session

    def upsert_many(self, records: list[MarineDay]) -> int:
        if not records:
            return 0
        rows = [
            {
                "location_id": r.location_id,
                "date": r.date,
                "wave_height_m": r.wave_height_m,
                "wave_period_s": r.wave_period_s,
                "source": r.source,
                "fetched_at": r.fetched_at,
            }
            for r in records
        ]
        stmt = upsert_stmt(self._session, MarineDailyORM).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["location_id", "date"],
            set_={k: stmt.excluded[k] for k in rows[0] if k not in ("location_id", "date")},
        )
        self._session.execute(stmt)
        self._session.commit()
        return len(rows)

    def get_for_location(self, location_id: int, date: date) -> MarineDay | None:
        row = self._session.scalar(
            select(MarineDailyORM).where(
                MarineDailyORM.location_id == location_id,
                MarineDailyORM.date == date,
            )
        )
        if not row:
            return None
        return MarineDay(
            location_id=row.location_id,
            date=row.date,
            wave_height_m=float(row.wave_height_m),
            wave_period_s=float(row.wave_period_s),
            source=row.source,
            fetched_at=row.fetched_at,
        )


class LocationRepo:
    def __init__(self, session: Session) -> None:
        self._session = session

    def ensure_locations(self, locations: list[dict[str, Any]]) -> dict[str, int]:
        if not locations:
            return {}

        stmt = upsert_stmt(self._session, LocationORM).values(locations)
        stmt = stmt.on_conflict_do_update(
            index_elements=["name"],
            set_={
                "lat": stmt.excluded.lat,
                "lon": stmt.excluded.lon,
                "is_coastal": stmt.excluded.is_coastal,
            },
        )
        self._session.execute(stmt)
        self._session.commit()

        rows = self._session.scalars(select(LocationORM)).all()
        return {r.name: r.id for r in rows}

    def list_all(self) -> list[LocationInfo]:
        rows = self._session.scalars(select(LocationORM)).all()
        return [
            LocationInfo(
                id=r.id,
                name=r.name,
                lat=float(r.lat),
                lon=float(r.lon),
                is_coastal=bool(r.is_coastal),
            )
            for r in rows
        ]
