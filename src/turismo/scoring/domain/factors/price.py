"""Hotel price relative to historical median scoring factor."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from turismo.scoring.domain.factors.base import PlaceDayContext
from turismo.scoring.domain.models import FactorScore, normalize_inverted
from turismo.shared.models import PlaceCategory


@dataclass(frozen=True)
class PriceInputs:
    price_usd: float
    median_price_usd: float
    snapshot_count: int


def score_price(
    inputs: PriceInputs,
    *,
    min_snapshots: int,
    source: str,
    data_date: date,
    weights: dict[str, float],
) -> list[FactorScore]:
    """Price relative to median: below median scores higher."""
    if inputs.snapshot_count < min_snapshots or inputs.median_price_usd <= 0:
        return []

    ratio = inputs.price_usd / inputs.median_price_usd
    price_score = normalize_inverted(ratio, 0.5, 2.0)

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


class PriceFactor:
    name = "price"

    def possible_weight(self, ctx: PlaceDayContext) -> float:
        return float(ctx.category_config.get("price", 0.0) or 0.0)

    def compute(self, ctx: PlaceDayContext) -> list[FactorScore]:
        price_weight = self.possible_weight(ctx)
        if (
            ctx.place.category != PlaceCategory.HOTEL
            or ctx.price_median is None
            or price_weight <= 0
        ):
            return []
        median_price, count = ctx.price_median
        return score_price(
            PriceInputs(
                price_usd=median_price,
                median_price_usd=median_price,
                snapshot_count=count,
            ),
            min_snapshots=int(ctx.thresholds.get("price_min_snapshots", 7)),
            source="price_snapshots",
            data_date=ctx.query_date,
            weights={"price": price_weight},
        )
