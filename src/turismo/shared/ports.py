"""Port definitions (Protocols) in the shared kernel for dependency inversion."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Protocol, runtime_checkable

from turismo.shared.geo import LocationInfo
from turismo.shared.models import (
    Event,
    MarineDay,
    Place,
    PlaceCategory,
    PlaceDetail,
    PlaceKind,
    PriceSnapshot,
    RunResult,
    ScoreResult,
    VisitorsMonth,
    WeatherDay,
)

__all__ = [
    "Clock",
    "EventRepository",
    "LocationInfo",
    "LocationRepository",
    "MarineRepository",
    "PlaceRepository",
    "PriceRepository",
    "ScoreRepository",
    "ScrapeRunRepository",
    "VisitorsRepository",
    "WeatherRepository",
]


@runtime_checkable
class Clock(Protocol):
    """Abstracts wall-clock access so tests can inject a fixed time."""

    def now_utc(self) -> datetime: ...
    def today_lima(self) -> date: ...


@runtime_checkable
class PlaceRepository(Protocol):
    def get_by_id(self, place_id: int) -> Place | None: ...
    def list_all(
        self,
        category: PlaceCategory | None = None,
        kind: PlaceKind | None = None,
        include_unclassified: bool = False,
    ) -> list[Place]: ...
    def list_places_with_score(
        self,
        query_date: date,
        category: PlaceCategory | None = None,
        kind: PlaceKind | None = None,
        zone: str | None = None,
        query: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[tuple[Place, float | None, float | None]]: ...
    def upsert_many(self, places: list[Place]) -> int: ...
    def get_osm_to_id_map(self) -> dict[int, int]: ...
    def get_name_to_id_map(self) -> dict[str, int]: ...
    def get_existing_ids(self) -> set[int]: ...
    def get_place_detail(self, place_id: int) -> PlaceDetail | None: ...


@runtime_checkable
class LocationRepository(Protocol):
    def ensure_locations(self, locations: list[dict[str, Any]]) -> dict[str, int]: ...
    def list_all(self) -> list[LocationInfo]: ...


@runtime_checkable
class WeatherRepository(Protocol):
    def upsert_many(self, records: list[WeatherDay]) -> int: ...
    def get_for_location(self, location_id: int, date: date) -> WeatherDay | None: ...


@runtime_checkable
class MarineRepository(Protocol):
    def upsert_many(self, records: list[MarineDay]) -> int: ...
    def get_for_location(self, location_id: int, date: date) -> MarineDay | None: ...


@runtime_checkable
class EventRepository(Protocol):
    def replace_all(self, events: list[Event]) -> int: ...
    def get_active_on(self, date: date) -> list[Event]: ...


@runtime_checkable
class VisitorsRepository(Protocol):
    def upsert_many(self, records: list[VisitorsMonth]) -> int: ...
    def get_annual_avg(self, place_id: int, year: int) -> float | None: ...
    def get_for_month(self, place_id: int, year: int, month: int) -> VisitorsMonth | None: ...


@runtime_checkable
class PriceRepository(Protocol):
    def upsert_many(self, records: list[PriceSnapshot]) -> int: ...
    def get_median(self, place_id: int, date_stay: date) -> tuple[float, int] | None: ...


@runtime_checkable
class ScoreRepository(Protocol):
    def upsert(self, result: ScoreResult, weights_version: str) -> None: ...
    def get(self, place_id: int, date: date) -> ScoreResult | None: ...
    def get_range(self, place_id: int, date_from: date, date_to: date) -> list[ScoreResult]: ...


@runtime_checkable
class ScrapeRunRepository(Protocol):
    def record(self, result: RunResult, started_at: datetime, finished_at: datetime) -> None: ...
    def get_latest_by_collector(self) -> dict[str, datetime]: ...
