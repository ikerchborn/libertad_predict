"""Legacy facade re-exporting SQLAlchemy ORM models from modular contexts."""
from __future__ import annotations

from turismo.events.infrastructure.models import EventORM
from turismo.places.infrastructure.models import OfferORM, PlaceDetailORM, PlaceORM
from turismo.pricing.infrastructure.models import PriceSnapshotORM
from turismo.scoring.infrastructure.models import ScoreORM, VisitorsMonthlyORM
from turismo.shared.db import Base, ScrapeRunORM
from turismo.weather.infrastructure.models import LocationORM, MarineDailyORM, WeatherDailyORM

__all__ = [
    "Base",
    "EventORM",
    "LocationORM",
    "MarineDailyORM",
    "OfferORM",
    "PlaceDetailORM",
    "PlaceORM",
    "PriceSnapshotORM",
    "ScoreORM",
    "ScrapeRunORM",
    "VisitorsMonthlyORM",
    "WeatherDailyORM",
]
