"""Shared commercial recommendation scoring function (pure Python)."""
from __future__ import annotations

from datetime import UTC, datetime

from turismo.shared.geo import haversine_km
from turismo.shared.models import (
    PlaceDetail,
    PlaceKind,
    RecommendationFactor,
    RecommendationResult,
)

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


def _normalize_inverted(value: float, low: float, high: float) -> float:
    if high == low:
        return 1.0
    linear = max(0.0, min(1.0, (value - low) / (high - low)))
    return 1.0 - linear


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
    """Pure recommendation score for commercial places (lodging, food, activity)."""
    fallback_weights = DEFAULT_RECOMMENDATION_WEIGHTS.get(
        kind, DEFAULT_RECOMMENDATION_WEIGHTS[PlaceKind.FOOD]
    )
    weights = weights_by_kind if weights_by_kind is not None else fallback_weights
    total_possible_weight = sum(weights.values())

    evaluated_factors: list[tuple[str, float, float, str]] = []
    distance_km: float | None = None

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

    price_val = observed_price
    if price_val is None and place_detail and place_detail.price_min is not None:
        price_val = place_detail.price_min

    if price_val is not None and median_price is not None and median_price > 0:
        ratio = price_val / median_price
        rel_score = _normalize_inverted(ratio, 0.5, 2.0)
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

    if crowd_level >= 4:
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

    if place_detail and place_detail.opening_hours:
        evaluated_factors.append(
            (
                "abierto",
                1.0,
                weights.get("open_now", 2.0),
                f"Horario de atención: {place_detail.opening_hours}",
            )
        )

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
        total_possible_weight = max(1.0, total_possible_weight - weights.get("safety", 0.0))

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
