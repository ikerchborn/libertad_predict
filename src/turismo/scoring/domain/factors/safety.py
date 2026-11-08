"""Safety scoring factor (georeferenced crime diagnosis from MININTER/SIDPOL)."""
from __future__ import annotations

from datetime import date

from turismo.scoring.domain.factors.base import PlaceDayContext
from turismo.scoring.domain.models import FactorScore, normalize_linear


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


class SafetyFactor:
    name = "safety"

    def possible_weight(self, ctx: PlaceDayContext) -> float:
        safety_weight = float(ctx.category_config.get("safety", 0.0) or 0.0)
        if (
            ctx.place_detail is not None
            and ctx.place_detail.safety_score is not None
            and safety_weight > 0
        ):
            return safety_weight
        return 0.0

    def compute(self, ctx: PlaceDayContext) -> list[FactorScore]:
        safety_weight = float(ctx.category_config.get("safety", 0.0) or 0.0)
        if (
            ctx.place_detail is None
            or ctx.place_detail.safety_score is None
            or safety_weight <= 0
        ):
            return []
        return score_safety(
            ctx.place_detail.safety_score,
            source=ctx.place_detail.source,
            data_date=ctx.query_date,
            weights={"safety": safety_weight},
        )
