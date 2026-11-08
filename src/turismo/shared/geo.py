"""Shared geographic primitives and distance calculations (pure Python)."""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class BoundingBox:
    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float

    def contains(self, lat: float, lon: float) -> bool:
        return self.lat_min <= lat <= self.lat_max and self.lon_min <= lon <= self.lon_max


LA_LIBERTAD_BBOX = BoundingBox(lat_min=-8.5, lat_max=-7.5, lon_min=-79.6, lon_max=-77.8)


@dataclass(frozen=True)
class LocationInfo:
    id: int
    name: str
    lat: float
    lon: float
    is_coastal: bool


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two geographic points in kilometers."""
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def find_nearest_location(
    lat: float, lon: float, locations: list[LocationInfo]
) -> LocationInfo | None:
    """Find the nearest climate monitoring location by Euclidean distance."""
    if not locations:
        return None
    return min(locations, key=lambda loc: (loc.lat - lat) ** 2 + (loc.lon - lon) ** 2)
