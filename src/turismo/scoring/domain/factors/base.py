"""Base protocol and context for individual scoring factors (Open/Closed Principle)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Protocol, runtime_checkable

from turismo.scoring.domain.models import FactorScore
from turismo.shared.models import (
    MarineDay,
    Place,
    PlaceDetail,
    VisitorsMonth,
    WeatherDay,
)


@dataclass(frozen=True)
class PlaceDayContext:
    """Immutable context for evaluating a place on a specific date."""

    place: Place
    query_date: date
    category_config: dict[str, Any]
    coastal_override: dict[str, Any]
    thresholds: dict[str, Any]
    weather_day: WeatherDay | None = None
    marine_day: MarineDay | None = None
    max_crowd_level: int = 0
    is_weekend: bool = False
    visitors_month: VisitorsMonth | None = None
    annual_avg_visitors: float | None = None
    price_median: tuple[float, int] | None = None
    place_detail: PlaceDetail | None = None


@runtime_checkable
class ScoreFactor(Protocol):
    """Contrato común: cada factor devuelve sub-factores normalizados en [0, 1].
    Así agregar un factor nuevo es agregar un archivo, no editar uno existente
    (principio Open/Closed).
    """

    name: str

    def possible_weight(self, ctx: PlaceDayContext) -> float: ...
    def compute(self, ctx: PlaceDayContext) -> list[FactorScore]: ...
