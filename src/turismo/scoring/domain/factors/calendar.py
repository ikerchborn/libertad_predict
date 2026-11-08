"""Calendar and event crowd scoring factor."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from turismo.scoring.domain.factors.base import PlaceDayContext
from turismo.scoring.domain.models import FactorScore


@dataclass(frozen=True)
class CalendarInputs:
    query_date: date
    crowd_level: int  # 0 if no event, 1-5 if event
    is_weekend: bool


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


class CalendarFactor:
    name = "calendar"

    def possible_weight(self, ctx: PlaceDayContext) -> float:
        calendar_weights: dict[str, float] = ctx.category_config.get("calendar", {}) or {}
        return float(sum(calendar_weights.values()))

    def compute(self, ctx: PlaceDayContext) -> list[FactorScore]:
        calendar_weights: dict[str, float] = ctx.category_config.get("calendar", {}) or {}
        return score_calendar(
            CalendarInputs(
                query_date=ctx.query_date,
                crowd_level=ctx.max_crowd_level,
                is_weekend=ctx.is_weekend,
            ),
            weekend_penalty=float(ctx.thresholds.get("weekend_penalty", 0.3)),
            crowd_penalty_per_level=float(ctx.thresholds.get("crowd_penalty_per_level", 0.15)),
            source="calendar",
            data_date=ctx.query_date,
            weights=calendar_weights,
        )
