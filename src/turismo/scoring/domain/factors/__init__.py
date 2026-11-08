"""Scoring factors registry and exports."""
from __future__ import annotations

from turismo.scoring.domain.factors.base import PlaceDayContext, ScoreFactor
from turismo.scoring.domain.factors.calendar import CalendarFactor, CalendarInputs, score_calendar
from turismo.scoring.domain.factors.external_rating import ExternalRatingFactor
from turismo.scoring.domain.factors.marine import MarineFactor, MarineInputs, score_marine
from turismo.scoring.domain.factors.price import PriceFactor, PriceInputs, score_price
from turismo.scoring.domain.factors.recommendation import (
    DEFAULT_RECOMMENDATION_WEIGHTS,
    compute_recommendation_score,
)
from turismo.scoring.domain.factors.safety import SafetyFactor, score_safety
from turismo.scoring.domain.factors.seasonality import (
    SeasonalityFactor,
    SeasonalityInputs,
    score_seasonality,
)
from turismo.scoring.domain.factors.weather import WeatherFactor, WeatherInputs, score_weather

DEFAULT_FACTORS: tuple[ScoreFactor, ...] = (
    WeatherFactor(),
    MarineFactor(),
    CalendarFactor(),
    SeasonalityFactor(),
    PriceFactor(),
    SafetyFactor(),
    ExternalRatingFactor(),
)

__all__ = [
    "DEFAULT_FACTORS",
    "DEFAULT_RECOMMENDATION_WEIGHTS",
    "CalendarFactor",
    "CalendarInputs",
    "ExternalRatingFactor",
    "MarineFactor",
    "MarineInputs",
    "PlaceDayContext",
    "PriceFactor",
    "PriceInputs",
    "SafetyFactor",
    "ScoreFactor",
    "SeasonalityFactor",
    "SeasonalityInputs",
    "WeatherFactor",
    "WeatherInputs",
    "compute_recommendation_score",
    "score_calendar",
    "score_marine",
    "score_price",
    "score_safety",
    "score_seasonality",
    "score_weather",
]
