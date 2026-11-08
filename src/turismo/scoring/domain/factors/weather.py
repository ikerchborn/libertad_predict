"""Weather scoring factor (temperature, rain, UV, wind)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from turismo.scoring.domain.factors.base import PlaceDayContext
from turismo.scoring.domain.models import FactorScore, normalize_inverted


@dataclass(frozen=True)
class WeatherInputs:
    temp_max_c: float
    temp_min_c: float
    precipitation_mm: float
    rain_probability: float
    uv_index: float
    wind_speed_kmh: float


def score_weather(
    inputs: WeatherInputs,
    *,
    temp_ideal_low: float,
    temp_ideal_high: float,
    precip_max: float,
    uv_max: float,
    wind_max: float,
    source: str,
    data_date: date,
    weights: dict[str, float],
) -> list[FactorScore]:
    """Compute per-sub-factor weather scores."""
    temp_avg = (inputs.temp_max_c + inputs.temp_min_c) / 2.0
    if temp_ideal_low <= temp_avg <= temp_ideal_high:
        temp_score = 1.0
    elif temp_avg < temp_ideal_low:
        temp_score = max(0.0, 1.0 - (temp_ideal_low - temp_avg) / 10.0)
    else:
        temp_score = max(0.0, 1.0 - (temp_avg - temp_ideal_high) / 10.0)

    if inputs.precipitation_mm < 1.0:
        rain_score = normalize_inverted(inputs.rain_probability * 0.45, 0.0, 1.0)
    else:
        rain_val = inputs.precipitation_mm / precip_max if precip_max > 0 else 0.0
        rain_score = normalize_inverted(max(rain_val, inputs.rain_probability), 0.0, 1.0)
    uv_score = normalize_inverted(inputs.uv_index, 0.0, uv_max)
    wind_score = normalize_inverted(inputs.wind_speed_kmh, 0.0, wind_max)

    factors = [
        FactorScore(
            name="weather_temperature",
            normalized_value=temp_score,
            weight=weights.get("temperature", 0.0),
            explanation=(
                f"Temperatura promedio {temp_avg:.1f}°C "
                f"(rango ideal {temp_ideal_low}-{temp_ideal_high}°C)"
            ),
            data_source=source,
            data_date=data_date,
        ),
        FactorScore(
            name="weather_rain",
            normalized_value=rain_score,
            weight=weights.get("rain", 0.0),
            explanation=(
                f"Precipitación {inputs.precipitation_mm:.1f} mm, "
                f"prob. lluvia {inputs.rain_probability*100:.0f}%"
            ),
            data_source=source,
            data_date=data_date,
        ),
        FactorScore(
            name="weather_uv",
            normalized_value=uv_score,
            weight=weights.get("uv", 0.0),
            explanation=f"Índice UV {inputs.uv_index:.1f} (máx. aceptable {uv_max:.1f})",
            data_source=source,
            data_date=data_date,
        ),
        FactorScore(
            name="weather_wind",
            normalized_value=wind_score,
            weight=weights.get("wind", 0.0),
            explanation=f"Viento {inputs.wind_speed_kmh:.1f} km/h (máx. aceptable {wind_max:.1f})",
            data_source=source,
            data_date=data_date,
        ),
    ]
    return [f for f in factors if f.weight > 0]


class WeatherFactor:
    name = "weather"

    def possible_weight(self, ctx: PlaceDayContext) -> float:
        weather_weights: dict[str, float] = ctx.category_config.get("weather", {}) or {}
        return float(sum(weather_weights.values()))

    def compute(self, ctx: PlaceDayContext) -> list[FactorScore]:
        if ctx.weather_day is None:
            return []
        weather_weights: dict[str, float] = ctx.category_config.get("weather", {}) or {}
        w_day = ctx.weather_day
        return score_weather(
            WeatherInputs(
                temp_max_c=w_day.temp_max_c,
                temp_min_c=w_day.temp_min_c,
                precipitation_mm=w_day.precipitation_mm,
                rain_probability=w_day.rain_probability,
                uv_index=w_day.uv_index,
                wind_speed_kmh=w_day.wind_speed_kmh,
            ),
            temp_ideal_low=float(ctx.thresholds.get("temp_ideal_low", 18)),
            temp_ideal_high=float(ctx.thresholds.get("temp_ideal_high", 28)),
            precip_max=float(ctx.thresholds.get("precip_max", 10)),
            uv_max=float(ctx.thresholds.get("uv_max", 8)),
            wind_max=float(ctx.thresholds.get("wind_max", 40)),
            source=w_day.source,
            data_date=w_day.date,
            weights=weather_weights,
        )
