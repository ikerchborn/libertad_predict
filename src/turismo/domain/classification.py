"""Legacy facade re-exporting place classification from turismo.places.domain.classification."""
from __future__ import annotations

from turismo.places.domain.classification import (
    classify_place,
    get_rules,
    load_classification_rules,
)

__all__ = [
    "classify_place",
    "get_rules",
    "load_classification_rules",
]
