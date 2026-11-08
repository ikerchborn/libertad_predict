"""Legacy facade re-exporting OpenMeteoCollector from turismo.weather.infrastructure."""
from __future__ import annotations

from turismo.weather.infrastructure.open_meteo_collector import (
    OpenMeteoCollector,
    RawDailyMarine,
    RawDailyWeather,
)

__all__ = [
    "OpenMeteoCollector",
    "RawDailyMarine",
    "RawDailyWeather",
]
