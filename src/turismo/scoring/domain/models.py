"""Domain primitives for tourism convenience and recommendation scoring."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class FactorScore:
    """Raw factor result before final combination."""

    name: str
    normalized_value: float  # [0, 1]
    weight: float
    explanation: str
    data_source: str
    data_date: date


def normalize_linear(value: float, low: float, high: float) -> float:
    """Map value to [0,1]: 0 at low (worst), 1 at high (best)."""
    if high == low:
        return 1.0
    return max(0.0, min(1.0, (value - low) / (high - low)))


def normalize_inverted(value: float, low: float, high: float) -> float:
    """Map value to [0,1]: 1 at low (best), 0 at high (worst)."""
    return 1.0 - normalize_linear(value, low, high)


def combine_factors(
    factors: list[FactorScore], total_possible_weight: float
) -> tuple[float, float]:
    """Combine factor scores into a final 0-100 score with confidence."""
    if not factors:
        return 0.0, 0.0

    weight_sum = sum(f.weight for f in factors)
    if weight_sum <= 0:
        return 0.0, 0.0

    weighted_score = sum(f.normalized_value * f.weight for f in factors)
    score = 100.0 * weighted_score / weight_sum
    confidence = weight_sum / total_possible_weight if total_possible_weight > 0 else 0.0
    return round(score, 2), round(min(1.0, confidence), 4)
