"""Legacy facade re-exporting EventsCollector from turismo.events.infrastructure."""
from __future__ import annotations

from turismo.events.infrastructure.events_collector import (
    EventRule,
    EventsCollector,
    EventsConfig,
    load_events_from_yaml,
)

__all__ = [
    "EventRule",
    "EventsCollector",
    "EventsConfig",
    "load_events_from_yaml",
]
