"""Commercial recommendation scoring (lodging, food, activity)."""
from __future__ import annotations

from turismo.shared.recommendation import (
    DEFAULT_RECOMMENDATION_WEIGHTS,
    compute_recommendation_score,
)

__all__ = ["DEFAULT_RECOMMENDATION_WEIGHTS", "compute_recommendation_score"]
