"""Application use cases orchestrating domain scoring and ports.

Strict layer separation:
- Only interacts with domain models and application ports.
- Zero imports from SQLAlchemy, HTTP, FastAPI, or APScheduler.
- Deterministic, explainable, and fully unit-testable with mock ports.
"""
from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import structlog
import yaml

from turismo.domain.models import (
    CoastType,
    FactorResult,
    Place,
    PlaceCategory,
    ScoreResult,
)
from turismo.domain.scoring import (
    CalendarInputs,
    FactorScore,
    MarineInputs,
    PriceInputs,
    SeasonalityInputs,
    WeatherInputs,
    combine_factors,
    score_calendar,
    score_marine,
    score_price,
    score_safety,
    score_seasonality,
    score_weather,
)

if TYPE_CHECKING:
    from turismo.application.ports import (
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


def find_nearest_location(
    lat: float, lon: float, locations: list[LocationInfo]
) -> LocationInfo | None:
    """Find the nearest climate monitoring location by Euclidean distance."""
    if not locations:
        return None
    return min(locations, key=lambda loc: (loc.lat - lat) ** 2 + (loc.lon - lon) ** 2)


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

    def _load_weights_config(self) -> dict[str, Any]:
        """Load and parse weights configuration from YAML."""
        if not self._weights_path.exists():
            raise FileNotFoundError(f"Weights configuration file not found: {self._weights_path}")
        with self._weights_path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
            if not isinstance(data, dict):
                raise ValueError(f"Invalid weights configuration in {self._weights_path}")
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

        # 1. Resolve target places
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

        # 2. Pre-load shared context
        locations = self._location_repo.list_all()
        events_on_date = self._event_repo.get_active_on(query_date)
        max_crowd_level = (
            max((e.crowd_level for e in events_on_date), default=0)
            if events_on_date
            else 0
        )
        is_weekend = query_date.weekday() >= 5

        results: list[ScoreResult] = []

        # 3. Score each place
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
        """Score an individual place across all available factors."""
        cat_key = place.category.value
        cat_cfg = categories_cfg.get(cat_key, {})
        thresholds = cat_cfg.get("thresholds", {})

        factors: list[FactorScore] = []
        total_possible_weight = 0.0

        # Nearest climate location
        nearest_loc = find_nearest_location(place.lat, place.lon, locations)

        # A. Weather factors
        weather_weights: dict[str, float] = cat_cfg.get("weather", {})
        total_possible_weight += sum(weather_weights.values())
        if nearest_loc is not None:
            w_day = self._weather_repo.get_for_location(nearest_loc.id, query_date)
            if w_day is not None:
                w_factors = score_weather(
                    WeatherInputs(
                        temp_max_c=w_day.temp_max_c,
                        temp_min_c=w_day.temp_min_c,
                        precipitation_mm=w_day.precipitation_mm,
                        rain_probability=w_day.rain_probability,
                        uv_index=w_day.uv_index,
                        wind_speed_kmh=w_day.wind_speed_kmh,
                    ),
                    temp_ideal_low=float(thresholds.get("temp_ideal_low", 18)),
                    temp_ideal_high=float(thresholds.get("temp_ideal_high", 28)),
                    precip_max=float(thresholds.get("precip_max", 10)),
                    uv_max=float(thresholds.get("uv_max", 8)),
                    wind_max=float(thresholds.get("wind_max", 40)),
                    source=w_day.source,
                    data_date=w_day.date,
                    weights=weather_weights,
                )
                factors.extend(w_factors)

        # B. Marine factors (if place is coastal)
        if place.coast_type == CoastType.COASTAL and nearest_loc is not None:
            marine_weights: dict[str, float] = (
                coastal_override.get("marine", {})
                or cat_cfg.get("marine", {})
                or {}
            )
            total_possible_weight += sum(marine_weights.values())
            m_day = self._marine_repo.get_for_location(nearest_loc.id, query_date)
            if m_day is not None:
                m_factors = score_marine(
                    MarineInputs(
                        wave_height_m=m_day.wave_height_m,
                        wave_period_s=m_day.wave_period_s,
                    ),
                    wave_height_max=float(thresholds.get("wave_height_max", 2.5)),
                    wave_period_min=float(thresholds.get("wave_period_min", 8.0)),
                    wave_period_max=float(thresholds.get("wave_period_max", 18.0)),
                    source=m_day.source,
                    data_date=m_day.date,
                    weights=marine_weights,
                )
                factors.extend(m_factors)

        # C. Calendar factors (weekend + events)
        calendar_weights: dict[str, float] = cat_cfg.get("calendar", {})
        total_possible_weight += sum(calendar_weights.values())
        cal_factors = score_calendar(
            CalendarInputs(
                query_date=query_date,
                crowd_level=max_crowd_level,
                is_weekend=is_weekend,
            ),
            weekend_penalty=float(thresholds.get("weekend_penalty", 0.3)),
            crowd_penalty_per_level=float(thresholds.get("crowd_penalty_per_level", 0.15)),
            source="calendar",
            data_date=query_date,
            weights=calendar_weights,
        )
        factors.extend(cal_factors)

        # D. Seasonality factor (MINCETUR visitors)
        season_weight = float(cat_cfg.get("seasonality", 0.0))
        total_possible_weight += season_weight
        if place.id is not None:
            v_month = self._visitors_repo.get_for_month(place.id, query_date.year, query_date.month)
            avg_v = self._visitors_repo.get_annual_avg(place.id, query_date.year)
            if v_month is not None and avg_v is not None and season_weight > 0:
                s_factors = score_seasonality(
                    SeasonalityInputs(
                        monthly_visitors=v_month.visitors,
                        annual_avg_visitors=avg_v,
                    ),
                    source=v_month.source,
                    data_date=date(v_month.year, v_month.month, 1),
                    weights={"seasonality": season_weight},
                )
                factors.extend(s_factors)

        # E. Hotel prices factor (hotels only)
        price_weight = float(cat_cfg.get("price", 0.0))
        total_possible_weight += price_weight
        if place.category == PlaceCategory.HOTEL and place.id is not None and price_weight > 0:
            median_res = self._price_repo.get_median(place.id, query_date)
            if median_res is not None:
                median_price, count = median_res
                # Use current day's price snapshot or median as observation
                p_factors = score_price(
                    PriceInputs(
                        price_usd=median_price,
                        median_price_usd=median_price,
                        snapshot_count=count,
                    ),
                    min_snapshots=int(thresholds.get("price_min_snapshots", 7)),
                    source="price_snapshots",
                    data_date=query_date,
                    weights={"price": price_weight},
                )
                factors.extend(p_factors)

        # F. Safety & External Rating factors (if non-NULL; if NULL, omit from confidence)
        safety_weight = float(cat_cfg.get("safety", 0.0))
        ext_rating_weight = float(cat_cfg.get("external_rating", 0.0))
        if place.id is not None and (safety_weight > 0 or ext_rating_weight > 0):
            detail = self._place_repo.get_place_detail(place.id)
            if detail is not None:
                if detail.safety_score is not None and safety_weight > 0:
                    total_possible_weight += safety_weight
                    sf_factors = score_safety(
                        detail.safety_score,
                        source=detail.source,
                        data_date=query_date,
                        weights={"safety": safety_weight},
                    )
                    factors.extend(sf_factors)
                if detail.stars is not None and ext_rating_weight > 0:
                    total_possible_weight += ext_rating_weight
                    r_norm = min(1.0, max(0.0, float(detail.stars) / 5.0))
                    factors.append(
                        FactorScore(
                            name="external_rating",
                            normalized_value=r_norm,
                            weight=ext_rating_weight,
                            explanation=f"Calificación verificada {detail.stars:.1f}/5.0",
                            data_source=detail.source,
                            data_date=query_date,
                        )
                    )

        # Calculate combined score and confidence
        score, confidence = combine_factors(factors, total_possible_weight)

        # Calculate exact contribution for explainability breakdown
        sum_weights = sum(f.weight for f in factors) or 1.0
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
            for f in factors
        ]

        assert place.id is not None
        return ScoreResult(
            place_id=place.id,
            date=query_date,
            score=score,
            confidence=confidence,
            breakdown=breakdown,
            computed_at=now_utc,
            weights_version=weights_version,
        )

    def get_best_days(
        self,
        place_id: int,
        date_from: date,
        date_to: date,
        limit: int = 5,
    ) -> list[ScoreResult]:
        """Query computed scores in a date range and return the best scoring days."""
        scores = self._score_repo.get_range(place_id, date_from, date_to)
        # Order by score DESC, confidence DESC
        sorted_scores = sorted(
            scores,
            key=lambda s: (s.score, s.confidence),
            reverse=True,
        )
        return sorted_scores[:limit]
