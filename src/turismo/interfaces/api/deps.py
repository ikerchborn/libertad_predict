"""Legacy facade re-exporting FastAPI dependencies from turismo.app.deps."""
from __future__ import annotations

from turismo.app.deps import (
    get_cached_settings,
    get_db,
    get_db_engine,
    get_repos,
    get_scoring_service,
    limiter,
)

__all__ = [
    "get_cached_settings",
    "get_db",
    "get_db_engine",
    "get_repos",
    "get_scoring_service",
    "limiter",
]
