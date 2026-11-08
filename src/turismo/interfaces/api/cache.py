"""Legacy facade re-exporting response caching from turismo.shared.cache."""
from __future__ import annotations

from turismo.shared.cache import (
    DEFAULT_TTL_SECONDS,
    ResponseCacheMiddleware,
    _compute_etag,
    invalidate_api_cache,
)

__all__ = [
    "DEFAULT_TTL_SECONDS",
    "ResponseCacheMiddleware",
    "_compute_etag",
    "invalidate_api_cache",
]
