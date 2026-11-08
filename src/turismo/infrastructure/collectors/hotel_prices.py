"""Legacy facade re-exporting HotelPricesCollector from turismo.pricing.infrastructure."""
from __future__ import annotations

from turismo.pricing.infrastructure.hotel_prices_collector import (
    COLUMN_ALIASES,
    HotelPricesCollector,
    RawPriceCsvRow,
    _normalize_price_columns,
)

__all__ = [
    "COLUMN_ALIASES",
    "HotelPricesCollector",
    "RawPriceCsvRow",
    "_normalize_price_columns",
]
