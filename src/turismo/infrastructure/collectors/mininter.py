"""Legacy facade re-exporting MININTER collector from turismo.safety.infrastructure."""
from __future__ import annotations

from turismo.safety.infrastructure.mininter_collector import (
    MININTER_FEATURE_SERVER,
    MININTER_USER_AGENT,
    MODALITY_LABELS,
    SNAPSHOT_SAFETY_PATH,
    build_safety_report_from_incidents,
    fetch_arcgis_incidents,
    haversine_distance_m,
    seed_places_safety_snapshot,
)

__all__ = [
    "MININTER_FEATURE_SERVER",
    "MININTER_USER_AGENT",
    "MODALITY_LABELS",
    "SNAPSHOT_SAFETY_PATH",
    "build_safety_report_from_incidents",
    "fetch_arcgis_incidents",
    "haversine_distance_m",
    "seed_places_safety_snapshot",
]
