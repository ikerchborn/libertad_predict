"""Legacy facade re-exporting OsmCollector from turismo.places.infrastructure."""
from __future__ import annotations

from turismo.places.infrastructure.osm_collector import (
    CATEGORY_NODE_FILTERS,
    CATEGORY_QUERIES,
    LA_LIBERTAD_ISO3166_2,
    TOURIST_ZONES,
    OsmCollector,
    build_overpass_query,
    build_zone_query,
    sanitize_text,
)

__all__ = [
    "CATEGORY_NODE_FILTERS",
    "CATEGORY_QUERIES",
    "LA_LIBERTAD_ISO3166_2",
    "TOURIST_ZONES",
    "OsmCollector",
    "build_overpass_query",
    "build_zone_query",
    "sanitize_text",
]
