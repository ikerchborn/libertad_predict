"""Pure scoring functions for tourism convenience.

score = 100 × Σ(w_i × f_i) / Σ(w_i of available factors)

All normalizers are pure functions parameterized by thresholds from weights.yaml.
Same inputs always produce the same output.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, date, datetime

from turismo.domain.models import (
    PlaceDetail,
    PlaceKind,
    RecommendationFactor,
    RecommendationResult,
)


@dataclass(frozen=True)
class WeatherInputs:
    temp_max_c: float
    temp_min_c: float
    precipitation_mm: float
    rain_probability: float
    uv_index: float
    wind_speed_kmh: float


@dataclass(frozen=True)
class MarineInputs:
    wave_height_m: float
    wave_period_s: float


@dataclass(frozen=True)
class CalendarInputs:
    query_date: date
    crowd_level: int  # 0 if no event, 1-5 if event
    is_weekend: bool


@dataclass(frozen=True)
class SeasonalityInputs:
    monthly_visitors: int
    annual_avg_visitors: float  # average monthly visitors for the year


@dataclass(frozen=True)
class PriceInputs:
    price_usd: float
    median_price_usd: float  # median for this place
    snapshot_count: int  # number of snapshots used to compute median


@dataclass(frozen=True)
class FactorScore:
    """Raw factor result before final combination."""

    name: str
    normalized_value: float  # [0, 1]
    weight: float
    explanation: str
    data_source: str
    data_date: date


def normalize_linear(value: float, low: float, high: float) -> float:
    """Map value to [0,1]: 0 at low (worst), 1 at high (best).

    Clamps outside the range rather than extrapolating.
    """
    if high == low:
        return 1.0
    return max(0.0, min(1.0, (value - low) / (high - low)))


def normalize_inverted(value: float, low: float, high: float) -> float:
    """Map value to [0,1]: 1 at low (best), 0 at high (worst)."""
    return 1.0 - normalize_linear(value, low, high)


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
    """Compute per-sub-factor weather scores.

    Temperature comfort uses a tent function: 1.0 at ideal range center,
    falling to 0 at extremes. Other sub-factors are inverted linear.
    """
    temp_avg = (inputs.temp_max_c + inputs.temp_min_c) / 2.0
    if temp_ideal_low <= temp_avg <= temp_ideal_high:
        temp_score = 1.0
    elif temp_avg < temp_ideal_low:
        temp_score = max(0.0, 1.0 - (temp_ideal_low - temp_avg) / 10.0)
    else:
        temp_score = max(0.0, 1.0 - (temp_avg - temp_ideal_high) / 10.0)

    if inputs.precipitation_mm < 1.0:
        # Coastal garúa / overcast without real rain (< 1 mm): gentle probability weighting
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


def score_marine(
    inputs: MarineInputs,
    *,
    wave_height_max: float,
    wave_period_min: float,
    wave_period_max: float,
    source: str,
    data_date: date,
    weights: dict[str, float],
) -> list[FactorScore]:
    """Wave height should be low for general tourists; period in comfortable range."""
    height_score = normalize_inverted(inputs.wave_height_m, 0.0, wave_height_max)
    period_score = normalize_linear(inputs.wave_period_s, wave_period_min, wave_period_max)

    factors = [
        FactorScore(
            name="marine_wave_height",
            normalized_value=height_score,
            weight=weights.get("wave_height", 0.0),
            explanation=(
                f"Altura de ola {inputs.wave_height_m:.1f} m "
                f"(máx. cómodo {wave_height_max:.1f} m)"
            ),
            data_source=source,
            data_date=data_date,
        ),
        FactorScore(
            name="marine_wave_period",
            normalized_value=period_score,
            weight=weights.get("wave_period", 0.0),
            explanation=(
                f"Período de ola {inputs.wave_period_s:.1f} s "
                f"(rango ideal {wave_period_min}-{wave_period_max} s)"
            ),
            data_source=source,
            data_date=data_date,
        ),
    ]
    return [f for f in factors if f.weight > 0]


def score_calendar(
    inputs: CalendarInputs,
    *,
    weekend_penalty: float,
    crowd_penalty_per_level: float,
    source: str,
    data_date: date,
    weights: dict[str, float],
) -> list[FactorScore]:
    """Weekend and event crowd levels reduce convenience."""
    weekend_score = 1.0 - (weekend_penalty if inputs.is_weekend else 0.0)
    crowd_score = max(0.0, 1.0 - inputs.crowd_level * crowd_penalty_per_level)

    factors = [
        FactorScore(
            name="calendar_weekend",
            normalized_value=max(0.0, weekend_score),
            weight=weights.get("weekend", 0.0),
            explanation="Fin de semana (mayor afluencia)" if inputs.is_weekend else "Día de semana",
            data_source=source,
            data_date=data_date,
        ),
        FactorScore(
            name="calendar_crowd",
            normalized_value=crowd_score,
            weight=weights.get("crowd", 0.0),
            explanation=f"Nivel de aglomeración por eventos: {inputs.crowd_level}/5",
            data_source=source,
            data_date=data_date,
        ),
    ]
    return [f for f in factors if f.weight > 0]


def score_seasonality(
    inputs: SeasonalityInputs,
    *,
    source: str,
    data_date: date,
    weights: dict[str, float],
) -> list[FactorScore]:
    """High visitor months reduce convenience (inverse of ratio)."""
    if inputs.annual_avg_visitors <= 0:
        ratio = 1.0
    else:
        ratio = inputs.monthly_visitors / inputs.annual_avg_visitors

    # Clamp ratio to [0, 3] — months with 3× average are fully inconvenient
    season_score = normalize_inverted(ratio, 0.0, 3.0)

    factors = [
        FactorScore(
            name="seasonality",
            normalized_value=season_score,
            weight=weights.get("seasonality", 0.0),
            explanation=(
                f"Visitantes mensuales {inputs.monthly_visitors:,} "
                f"vs promedio anual {inputs.annual_avg_visitors:,.0f}"
            ),
            data_source=source,
            data_date=data_date,
        )
    ]
    return [f for f in factors if f.weight > 0]


def score_price(
    inputs: PriceInputs,
    *,
    min_snapshots: int,
    source: str,
    data_date: date,
    weights: dict[str, float],
) -> list[FactorScore]:
    """Price relative to median: below median scores higher.

    Skipped entirely when fewer than min_snapshots are available.
    """
    if inputs.snapshot_count < min_snapshots or inputs.median_price_usd <= 0:
        return []

    ratio = inputs.price_usd / inputs.median_price_usd
    price_score = normalize_inverted(ratio, 0.5, 2.0)  # 50% below = best, 2× above = worst

    factors = [
        FactorScore(
            name="price_relative",
            normalized_value=price_score,
            weight=weights.get("price", 0.0),
            explanation=(
                f"Precio USD {inputs.price_usd:.0f} "
                f"vs mediana {inputs.median_price_usd:.0f} ({ratio:.1f}×)"
            ),
            data_source=source,
            data_date=data_date,
        )
    ]
    return [f for f in factors if f.weight > 0]


def score_safety(
    safety_score_val: float | None,
    *,
    source: str,
    data_date: date,
    weights: dict[str, float],
) -> list[FactorScore]:
    """Safety score (0-100) normalized to [0, 1].

    Strictly omitted when safety_score_val is None (does not penalize,
    omits from confidence calculation).
    """
    if safety_score_val is None:
        return []

    norm = normalize_linear(safety_score_val, 0.0, 100.0)
    factors = [
        FactorScore(
            name="safety",
            normalized_value=norm,
            weight=weights.get("safety", 0.0),
            explanation=f"Índice de seguridad verificado: {safety_score_val:.0f}/100",
            data_source=source,
            data_date=data_date,
        )
    ]
    return [f for f in factors if f.weight > 0]


def combine_factors(
    factors: list[FactorScore], total_possible_weight: float
) -> tuple[float, float]:
    """Combine factor scores into a final 0-100 score with confidence.

    confidence = proportion of total_possible_weight that had data.
    Returns (score, confidence).
    """
    if not factors:
        return 0.0, 0.0

    weight_sum = sum(f.weight for f in factors)
    if weight_sum <= 0:
        return 0.0, 0.0

    weighted_score = sum(f.normalized_value * f.weight for f in factors)
    score = 100.0 * weighted_score / weight_sum
    confidence = weight_sum / total_possible_weight if total_possible_weight > 0 else 0.0
    return round(score, 2), round(min(1.0, confidence), 4)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two geographic points in kilometers."""
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


DEFAULT_RECOMMENDATION_WEIGHTS: dict[PlaceKind, dict[str, float]] = {
    PlaceKind.LODGING: {
        "relative_price": 3.0,
        "completeness": 2.5,
        "external_rating": 2.0,
        "proximity": 2.0,
        "event_context": 2.0,
        "open_now": 1.0,
        "safety": 2.0,
    },
    PlaceKind.FOOD: {
        "relative_price": 2.5,
        "completeness": 3.0,
        "external_rating": 2.0,
        "proximity": 3.0,
        "event_context": 1.0,
        "open_now": 2.5,
        "safety": 2.0,
    },
    PlaceKind.ACTIVITY: {
        "relative_price": 2.0,
        "completeness": 3.5,
        "external_rating": 2.0,
        "proximity": 2.5,
        "event_context": 1.5,
        "open_now": 2.0,
        "safety": 2.0,
    },
}


def compute_recommendation_score(
    place_id: int,
    kind: PlaceKind,
    place_lat: float,
    place_lon: float,
    place_detail: PlaceDetail | None = None,
    ref_lat: float | None = None,
    ref_lon: float | None = None,
    ref_name: str | None = None,
    observed_price: float | None = None,
    median_price: float | None = None,
    crowd_level: int = 0,
    weights_by_kind: dict[str, float] | None = None,
    computed_at: datetime | None = None,
) -> RecommendationResult:
    """Pure recommendation score for commercial places (lodging, food, activity).

    Factors evaluated only if data exists, then renormalized. Confidence reflects
    data completeness. Never invents ratings.
    """
    fallback_weights = DEFAULT_RECOMMENDATION_WEIGHTS.get(
        kind, DEFAULT_RECOMMENDATION_WEIGHTS[PlaceKind.FOOD]
    )
    weights = weights_by_kind if weights_by_kind is not None else fallback_weights
    total_possible_weight = sum(weights.values())

    evaluated_factors: list[tuple[str, float, float, str]] = []
    distance_km: float | None = None

    # 1. Proximity to reference place (e.g. nearby attraction)
    if ref_lat is not None and ref_lon is not None:
        distance_km = round(haversine_km(place_lat, place_lon, ref_lat, ref_lon), 2)
        if distance_km <= 1.0:
            prox_score = 1.0
        elif distance_km <= 3.0:
            prox_score = 0.85
        elif distance_km <= 6.0:
            prox_score = 0.70
        elif distance_km <= 12.0:
            prox_score = 0.50
        else:
            prox_score = max(0.1, round(1.0 - (distance_km / 35.0), 2))

        ref_str = f" a {ref_name}" if ref_name else ""
        evaluated_factors.append(
            (
                "cercania",
                prox_score,
                weights.get("proximity", 2.5),
                f"Ubicado a {distance_km:.1f} km{ref_str}",
            )
        )

    # 2. Information completeness (signals an active, reachable business)
    if place_detail is not None:
        comp_points = 0.0
        details_present: list[str] = []
        if place_detail.website:
            comp_points += 0.30
            details_present.append("web oficial")
        if place_detail.phone:
            comp_points += 0.25
            details_present.append("teléfono")
        if place_detail.opening_hours:
            comp_points += 0.25
            details_present.append("horario")
        if (
            place_detail.menu_url
            or place_detail.cuisine
            or place_detail.stars
            or place_detail.price_min
        ):
            comp_points += 0.20
            details_present.append("carta/tarifas")

        comp_score = min(1.0, max(0.15, comp_points))
        detail_msg = (
            f"Canales verificados: {', '.join(details_present)}"
            if details_present
            else "Datos básicos"
        )
        evaluated_factors.append(
            ("completitud", comp_score, weights.get("completeness", 3.0), detail_msg)
        )
    else:
        evaluated_factors.append(
            (
                "completitud",
                0.20,
                weights.get("completeness", 3.0),
                "Sin datos de contacto verificados",
            )
        )

    # 3. Relative price (vs median or price_level)
    price_val = observed_price
    if price_val is None and place_detail and place_detail.price_min is not None:
        price_val = place_detail.price_min

    if price_val is not None and median_price is not None and median_price > 0:
        ratio = price_val / median_price
        rel_score = normalize_inverted(ratio, 0.5, 2.0)
        evaluated_factors.append(
            (
                "precio_relativo",
                rel_score,
                weights.get("relative_price", 2.5),
                f"Tarifa ({price_val:.0f} PEN) es {ratio:.1f}x la mediana de la zona",
            )
        )
    elif place_detail and place_detail.price_level is not None:
        level_map = {1: 0.95, 2: 0.80, 3: 0.60, 4: 0.40}
        rel_score = level_map.get(place_detail.price_level, 0.70)
        evaluated_factors.append(
            (
                "precio_relativo",
                rel_score,
                weights.get("relative_price", 2.5),
                f"Rango de precio {'$' * place_detail.price_level}",
            )
        )

    # 4. External rating (STRICT: ONLY if verified source loaded, NEVER invented)
    if place_detail and place_detail.stars is not None:
        rating_score = min(1.0, max(0.0, float(place_detail.stars) / 5.0))
        evaluated_factors.append(
            (
                "calificacion_externa",
                rating_score,
                weights.get("external_rating", 2.0),
                f"Clasificación oficial {place_detail.stars:.1f} estrellas",
            )
        )

    # 5. Date / crowd context (upcoming massive events)
    if crowd_level >= 4:
        # High crowd event: hotels fill up / restaurants are busy
        ctx_score = 0.55 if kind == PlaceKind.LODGING else 0.80
        ctx_desc = "Alta demanda en la fecha por evento o festividad masiva"
        evaluated_factors.append(
            ("contexto_fecha", ctx_score, weights.get("event_context", 2.0), ctx_desc)
        )
    elif crowd_level > 0:
        ctx_score = 0.75
        ctx_desc = "Afluencia regular prevista"
        evaluated_factors.append(
            ("contexto_fecha", ctx_score, weights.get("event_context", 2.0), ctx_desc)
        )
    else:
        ctx_score = 0.90
        ctx_desc = "Afluencia tranquila en la fecha"
        evaluated_factors.append(
            ("contexto_fecha", ctx_score, weights.get("event_context", 2.0), ctx_desc)
        )

    # 6. Opening hours
    if place_detail and place_detail.opening_hours:
        evaluated_factors.append(
            (
                "abierto",
                1.0,
                weights.get("open_now", 2.0),
                f"Horario de atención: {place_detail.opening_hours}",
            )
        )

    # 7. Safety score (STRICT: ONLY if verified safety_score exists; if NULL, omit)
    if place_detail and place_detail.safety_score is not None:
        s_norm = min(1.0, max(0.0, float(place_detail.safety_score) / 100.0))
        evaluated_factors.append(
            (
                "seguridad",
                s_norm,
                weights.get("safety", 2.0),
                f"Índice de seguridad zonal: {place_detail.safety_score:.0f}/100",
            )
        )
    else:
        # Subtract safety weight when NULL so it does not penalize confidence
        total_possible_weight = max(1.0, total_possible_weight - weights.get("safety", 0.0))

    # Renormalize
    active_weight = sum(w for _, _, w, _ in evaluated_factors)
    if active_weight <= 0:
        return RecommendationResult(
            place_id=place_id,
            kind=kind,
            score=0.0,
            confidence=0.0,
            summary="Sin información suficiente para recomendar",
            breakdown=[],
            distance_km=distance_km,
            computed_at=computed_at or datetime.now(UTC),
        )

    breakdown: list[RecommendationFactor] = []
    total_weighted = 0.0
    for name, f_score, w, explanation in evaluated_factors:
        contrib = (f_score * w) / active_weight
        total_weighted += f_score * w
        breakdown.append(
            RecommendationFactor(
                name=name,
                score=round(f_score, 3),
                weight=round(w, 2),
                contribution=round(contrib, 4),
                explanation=explanation,
            )
        )

    final_score = round(100.0 * (total_weighted / active_weight), 2)
    confidence = round(min(1.0, active_weight / total_possible_weight), 4)

    # Concise Spanish summary
    kind_labels = {
        PlaceKind.LODGING: "alojamiento",
        PlaceKind.FOOD: "gastronomía",
        PlaceKind.ACTIVITY: "actividad",
    }
    label = kind_labels.get(kind, "establecimiento")
    if distance_km is not None and distance_km <= 2.5:
        summary = f"Excelente opción de {label} a {distance_km:.1f} km con datos confirmados."
    elif final_score >= 75:
        summary = f"Opción destacada de {label} por su alta completitud y contacto directo."
    else:
        summary = f"Recomendación moderada de {label} basada en su registro oficial."

    return RecommendationResult(
        place_id=place_id,
        kind=kind,
        score=final_score,
        confidence=confidence,
        summary=summary,
        breakdown=breakdown,
        distance_km=distance_km,
        computed_at=computed_at or datetime.now(UTC),
    )
