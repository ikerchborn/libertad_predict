"""External verified rating scoring factor."""
from __future__ import annotations

from turismo.scoring.domain.factors.base import PlaceDayContext
from turismo.scoring.domain.models import FactorScore


class ExternalRatingFactor:
    name = "external_rating"

    def possible_weight(self, ctx: PlaceDayContext) -> float:
        ext_rating_weight = float(ctx.category_config.get("external_rating", 0.0) or 0.0)
        if (
            ctx.place_detail is not None
            and ctx.place_detail.stars is not None
            and ext_rating_weight > 0
        ):
            return ext_rating_weight
        return 0.0

    def compute(self, ctx: PlaceDayContext) -> list[FactorScore]:
        ext_rating_weight = float(ctx.category_config.get("external_rating", 0.0) or 0.0)
        if (
            ctx.place_detail is None
            or ctx.place_detail.stars is None
            or ext_rating_weight <= 0
        ):
            return []
        r_norm = min(1.0, max(0.0, float(ctx.place_detail.stars) / 5.0))
        return [
            FactorScore(
                name="external_rating",
                normalized_value=r_norm,
                weight=ext_rating_weight,
                explanation=f"Calificación verificada {ctx.place_detail.stars:.1f}/5.0",
                data_source=ctx.place_detail.source,
                data_date=ctx.query_date,
            )
        ]
