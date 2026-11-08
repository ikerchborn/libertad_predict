"""Marine conditions scoring factor (wave height and wave period)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from turismo.scoring.domain.factors.base import PlaceDayContext
from turismo.scoring.domain.models import FactorScore, normalize_inverted, normalize_linear
from turismo.shared.models import CoastType


@dataclass(frozen=True)
class MarineInputs:
    wave_height_m: float
    wave_period_s: float


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


class MarineFactor:
    name = "marine"

    def _get_weights(self, ctx: PlaceDayContext) -> dict[str, float]:
        if ctx.place.coast_type != CoastType.COASTAL:
            return {}
        return (
            ctx.coastal_override.get("marine", {})
            or ctx.category_config.get("marine", {})
            or {}
        )

    def possible_weight(self, ctx: PlaceDayContext) -> float:
        return float(sum(self._get_weights(ctx).values()))

    def compute(self, ctx: PlaceDayContext) -> list[FactorScore]:
        if ctx.place.coast_type != CoastType.COASTAL or ctx.marine_day is None:
            return []
        marine_weights = self._get_weights(ctx)
        m_day = ctx.marine_day
        return score_marine(
            MarineInputs(
                wave_height_m=m_day.wave_height_m,
                wave_period_s=m_day.wave_period_s,
            ),
            wave_height_max=float(ctx.thresholds.get("wave_height_max", 2.5)),
            wave_period_min=float(ctx.thresholds.get("wave_period_min", 8.0)),
            wave_period_max=float(ctx.thresholds.get("wave_period_max", 18.0)),
            source=m_day.source,
            data_date=m_day.date,
            weights=marine_weights,
        )
