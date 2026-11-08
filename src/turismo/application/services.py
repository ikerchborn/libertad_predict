"""Legacy facade re-exporting ScoringService and ScoringEngine from turismo.scoring."""
from __future__ import annotations

from turismo.scoring.application.engine import ScoringEngine, ScoringService
from turismo.shared.geo import find_nearest_location

__all__ = [
    "ScoringEngine",
    "ScoringService",
    "find_nearest_location",
]
