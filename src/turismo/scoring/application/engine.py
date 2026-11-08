"""Scoring application engine and service.

ScoringEngine iterates over registered ScoreFactor instances (Open/Closed Principle).
ScoringService orchestrates data retrieval via ports and delegates evaluation to ScoringEngine.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, date, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import structlog
import yaml

from turismo.scoring.domain.factors import DEFAULT_FACTORS, PlaceDayContext, ScoreFactor
from turismo.scoring.domain.models import FactorScore, combine_factors
from turismo.shared.geo import find_nearest_location
from turismo.shared.models import (
    CoastType,
    FactorResult,
    Place,
    PlaceCategory,
    ScoreResult,
)

if TYPE_CHECKING:
    from turismo.shared.ports import (
        Clock,
        EventRepository,
        LocationInfo,
        LocationRepository,
        MarineRepository,
        PlaceRepository,
        PriceRepository,
        ScoreRepository,
        VisitorsRepository,
        WeatherRepository,
    )

logger = structlog.get_logger(__name__)

DEFAULT_WEIGHTS_PATH = Path(__file__).resolve().parent.parent / "weights.yaml"


class ScoringEngine:
    """Evaluates a PlaceDayContext by iterating over registered ScoreFactor instances."""

    def __init__(self, factors: Sequence[ScoreFactor] | None = None) -> None:
        self._factors: tuple[ScoreFactor, ...] = (
            tuple(factors) if factors is not None else DEFAULT_FACTORS
        )

    @property
    def factors(self) -> tuple[ScoreFactor, ...]:
        return self._factors

    def evaluate(
        self,
        ctx: PlaceDayContext,
        weights_version: str,
        now_utc: datetime,
    ) -> ScoreResult:
        evaluated_factors: list[FactorScore] = []
        total_possible_weight = 0.0

        for factor in self._factors:
            total_possible_weight += factor.possible_weight(ctx)
            evaluated_factors.extend(factor.compute(ctx))

        score, confidence = combine_factors(evaluated_factors, total_possible_weight)

        sum_weights = sum(f.weight for f in evaluated_factors) or 1.0
        breakdown: list[FactorResult] = [
            FactorResult(
                name=f.name,
                value=round(f.normalized_value, 4),
                weight=round(f.weight, 2),
                contribution=round((f.normalized_value * f.weight) / sum_weights, 4),
                data_source=f.data_source,
                data_date=f.data_date,
                explanation=f.explanation,
            )
            for f in evaluated_factors
        ]

        assert ctx.place.id is not None
        return ScoreResult(
            place_id=ctx.place.id,
            date=ctx.query_date,
            score=score,
            confidence=confidence,
            breakdown=breakdown,
            computed_at=now_utc,
            weights_version=weights_version,
        )


class ScoringService:
    """Coordinates data retrieval and calculates tourism convenience scores."""

    def __init__(
        self,
        place_repo: PlaceRepository,
        location_repo: LocationRepository,
        weather_repo: WeatherRepository,
        marine_repo: MarineRepository,
        event_repo: EventRepository,
        visitors_repo: VisitorsRepository,
        price_repo: PriceRepository,
        score_repo: ScoreRepository,
        weights_path: Path = Path("config/weights.yaml"),
        clock: Clock | None = None,
        engine: ScoringEngine | None = None,
    ) -> None:
        self._place_repo = place_repo
        self._location_repo = location_repo
        self._weather_repo = weather_repo
        self._marine_repo = marine_repo
        self._event_repo = event_repo
        self._visitors_repo = visitors_repo
        self._price_repo = price_repo
        self._score_repo = score_repo
        self._weights_path = weights_path
        self._clock = clock
        self._engine = engine or ScoringEngine()

    def _load_weights_config(self) -> dict[str, Any]:
        """Load and parse weights configuration from YAML."""
        target_path = self._weights_path
        if not target_path.exists() and DEFAULT_WEIGHTS_PATH.exists():
            target_path = DEFAULT_WEIGHTS_PATH
        if not target_path.exists():
            raise FileNotFoundError(f"Weights configuration file not found: {self._weights_path}")
        with target_path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
            if not isinstance(data, dict):
                raise ValueError(f"Invalid weights configuration in {target_path}")
            return data

    def compute_scores(
        self,
        query_date: date,
        place_id: int | None = None,
    ) -> list[ScoreResult]:
        """Compute and persist convenience scores for all target places on a given date."""
        weights_config = self._load_weights_config()
        weights_version = str(weights_config.get("version", "1.0"))
        categories_cfg = weights_config.get("categories", {})
        coastal_override = categories_cfg.get("coastal_override", {})

        now_utc = (
            self._clock.now_utc()
            if self._clock is not None
            else datetime.now(tz=UTC)
        )

        places: list[Place] = []
        if place_id is not None:
            p = self._place_repo.get_by_id(place_id)
            if p is not None:
                places.append(p)
        else:
            places = self._place_repo.list_all()

        if not places:
            logger.info("No places found to score", query_date=str(query_date), place_id=place_id)
            return []

        locations = self._location_repo.list_all()
        events_on_date = self._event_repo.get_active_on(query_date)
        max_crowd_level = (
            max((e.crowd_level for e in events_on_date), default=0)
            if events_on_date
            else 0
        )
        is_weekend = query_date.weekday() >= 5

        results: list[ScoreResult] = []

        for place in places:
            if place.id is None:
                continue

            score_res = self._score_single_place(
                place=place,
                query_date=query_date,
                locations=locations,
                max_crowd_level=max_crowd_level,
                is_weekend=is_weekend,
                categories_cfg=categories_cfg,
                coastal_override=coastal_override,
                weights_version=weights_version,
                now_utc=now_utc,
            )
            self._score_repo.upsert(score_res, weights_version)
            results.append(score_res)

        return results

    def _score_single_place(
        self,
        place: Place,
        query_date: date,
        locations: list[LocationInfo],
        max_crowd_level: int,
        is_weekend: bool,
        categories_cfg: dict[str, Any],
        coastal_override: dict[str, Any],
        weights_version: str,
        now_utc: datetime,
    ) -> ScoreResult:
        """Build PlaceDayContext and evaluate via ScoringEngine."""
        assert place.id is not None
        cat_key = place.category.value
        cat_cfg = categories_cfg.get(cat_key, {})
        thresholds = cat_cfg.get("thresholds", {})

        nearest_loc = find_nearest_location(place.lat, place.lon, locations)
        w_day = (
            self._weather_repo.get_for_location(nearest_loc.id, query_date)
            if nearest_loc is not None
            else None
        )
        m_day = (
            self._marine_repo.get_for_location(nearest_loc.id, query_date)
            if (place.coast_type == CoastType.COASTAL and nearest_loc is not None)
            else None
        )

        season_weight = float(cat_cfg.get("seasonality", 0.0) or 0.0)
        v_month = (
            self._visitors_repo.get_for_month(place.id, query_date.year, query_date.month)
            if season_weight > 0
            else None
        )
        avg_v = (
            self._visitors_repo.get_annual_avg(place.id, query_date.year)
            if season_weight > 0
            else None
        )

        price_weight = float(cat_cfg.get("price", 0.0) or 0.0)
        price_median = (
            self._price_repo.get_median(place.id, query_date)
            if (place.category == PlaceCategory.HOTEL and price_weight > 0)
            else None
        )

        safety_weight = float(cat_cfg.get("safety", 0.0) or 0.0)
        ext_rating_weight = float(cat_cfg.get("external_rating", 0.0) or 0.0)
        detail = (
            self._place_repo.get_place_detail(place.id)
            if (safety_weight > 0 or ext_rating_weight > 0)
            else None
        )

        ctx = PlaceDayContext(
            place=place,
            query_date=query_date,
            category_config=cat_cfg,
            coastal_override=coastal_override,
            thresholds=thresholds,
            weather_day=w_day,
            marine_day=m_day,
            max_crowd_level=max_crowd_level,
            is_weekend=is_weekend,
            visitors_month=v_month,
            annual_avg_visitors=avg_v,
            price_median=price_median,
            place_detail=detail,
        )
        return self._engine.evaluate(ctx, weights_version=weights_version, now_utc=now_utc)

    def get_best_days(
        self,
        place_id: int,
        date_from: date,
        date_to: date,
        limit: int = 5,
    ) -> list[ScoreResult]:
        """Query computed scores in a date range and return the best scoring days."""
        scores = self._score_repo.get_range(place_id, date_from, date_to)
        sorted_scores = sorted(
            scores,
            key=lambda s: (s.score, s.confidence),
            reverse=True,
        )
        return sorted_scores[:limit]
