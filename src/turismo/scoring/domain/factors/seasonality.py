"""Seasonality scoring factor (monthly tourist visitors from MINCETUR)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from turismo.scoring.domain.factors.base import PlaceDayContext
from turismo.scoring.domain.models import FactorScore, normalize_inverted


@dataclass(frozen=True)
class SeasonalityInputs:
    monthly_visitors: int
    annual_avg_visitors: float


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


class SeasonalityFactor:
    name = "seasonality"

    def possible_weight(self, ctx: PlaceDayContext) -> float:
        return float(ctx.category_config.get("seasonality", 0.0) or 0.0)

    def compute(self, ctx: PlaceDayContext) -> list[FactorScore]:
        season_weight = self.possible_weight(ctx)
        if (
            ctx.visitors_month is None
            or ctx.annual_avg_visitors is None
            or season_weight <= 0
        ):
            return []
        v_month = ctx.visitors_month
        return score_seasonality(
            SeasonalityInputs(
                monthly_visitors=v_month.visitors,
                annual_avg_visitors=ctx.annual_avg_visitors,
            ),
            source=v_month.source,
            data_date=date(v_month.year, v_month.month, 1),
            weights={"seasonality": season_weight},
        )
