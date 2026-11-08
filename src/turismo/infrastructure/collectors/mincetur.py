"""Legacy facade re-exporting MinceturCollector from turismo.scoring.infrastructure."""
from __future__ import annotations

from turismo.scoring.infrastructure.mincetur_collector import (
    COLUMN_ALIASES,
    MinceturCollector,
    RawVisitorRow,
    normalize_dataframe_columns,
)

__all__ = [
    "COLUMN_ALIASES",
    "MinceturCollector",
    "RawVisitorRow",
    "normalize_dataframe_columns",
]
