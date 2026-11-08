"""Legacy facade re-exporting configuration from turismo.shared.config."""
from __future__ import annotations

from turismo.shared.config import DEFAULT_LOCATIONS, LocationConfig, Settings, get_settings

__all__ = [
    "DEFAULT_LOCATIONS",
    "LocationConfig",
    "Settings",
    "get_settings",
]
