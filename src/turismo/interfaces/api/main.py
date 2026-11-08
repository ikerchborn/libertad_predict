"""Legacy facade re-exporting FastAPI app from the modular composition root."""
from __future__ import annotations

from turismo.app.api import app, create_app, lifespan
from turismo.shared.deps import limiter

__all__ = [
    "app",
    "create_app",
    "lifespan",
    "limiter",
]
