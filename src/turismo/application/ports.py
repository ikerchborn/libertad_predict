"""Legacy facade re-exporting application ports from turismo.shared.ports."""
from __future__ import annotations

from turismo.shared.ports import (
    Clock,
    EventRepository,
    LocationInfo,
    LocationRepository,
    MarineRepository,
    PlaceRepository,
    PriceRepository,
    ScoreRepository,
    ScrapeRunRepository,
    VisitorsRepository,
    WeatherRepository,
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
