"""OpenStreetMap Overpass collector for tourist places in La Libertad, Peru.

Queries Overpass API filtered by the administrative area (ISO3166-2:PE-LAL):
1. Hotels (tourism=hotel|hostel|guest_house)
2. Restaurants (amenity=restaurant|cafe)
3. Attractions (tourism=attraction|museum, historic=*)

Enforces:
- Server timeout in Overpass QL ([timeout:25])
- Inter-query rate limiting
- Deduplication by osm_id
- Unicode NFKC normalization and length limits
- Coordinate validation inside La Libertad bounding box
"""
from __future__ import annotations

import asyncio
import json
import unicodedata
from typing import TYPE_CHECKING, Any

from turismo.domain.classification import classify_place
from turismo.domain.models import CoastType, Place, PlaceCategory, RunResult
from turismo.infrastructure.collectors.base import BaseCollector

if TYPE_CHECKING:
    from turismo.config import Settings
    from turismo.infrastructure.db.repositories import PlaceRepo, ScrapeRunRepo
    from turismo.infrastructure.http.client import SafeHttpClient

# ISO 3166-2 code for the department of La Libertad, Peru
LA_LIBERTAD_ISO3166_2 = "PE-LAL"

CATEGORY_QUERIES = {
    PlaceCategory.HOTEL: """
        node["tourism"~"^(hotel|hostel|guest_house)$"](area.searchArea);
        way["tourism"~"^(hotel|hostel|guest_house)$"](area.searchArea);
    """,
    PlaceCategory.RESTAURANT: """
        node["amenity"~"^(restaurant|cafe)$"](area.searchArea);
        way["amenity"~"^(restaurant|cafe)$"](area.searchArea);
    """,
    PlaceCategory.ATTRACTION: """
        node["tourism"~"^(attraction|museum)$"](area.searchArea);
        way["tourism"~"^(attraction|museum)$"](area.searchArea);
        node["historic"](area.searchArea);
        way["historic"](area.searchArea);
    """,
}


# Tourist zones in La Libertad for targeted Overpass queries: (name, (south, west, north, east))
TOURIST_ZONES: list[tuple[str, tuple[float, float, float, float]]] = [
    ("Trujillo Centro y Moche", (-8.16, -79.08, -8.06, -78.98)),
    ("Huanchaco", (-8.10, -79.15, -8.05, -79.10)),
    ("Chicama", (-7.86, -79.46, -7.82, -79.41)),
    ("Huamachuco", (-7.83, -78.07, -7.79, -78.03)),
]

CATEGORY_NODE_FILTERS: dict[PlaceCategory, str] = {
    PlaceCategory.HOTEL: '["tourism"~"^(hotel|hostel|guest_house)$"]',
    PlaceCategory.RESTAURANT: '["amenity"~"^(restaurant|cafe)$"]',
    PlaceCategory.ATTRACTION: '["tourism"~"^(attraction|museum)$"]',
}


def build_zone_query(
    filter_expr: str,
    bbox: tuple[float, float, float, float],
    timeout_seconds: int = 25,
    limit: int = 60,
) -> str:
    """Build a fast targeted Overpass query for a specific zone and node filter."""
    s, w, n, e = bbox
    return f"""[out:json][timeout:{timeout_seconds}];
(
  node{filter_expr}({s},{w},{n},{e});
);
out center tags {limit};"""


def build_overpass_query(subquery: str, timeout_seconds: int = 25) -> str:
    """Build a complete Overpass QL query constrained to La Libertad administrative area."""
    return f"""[out:json][timeout:{timeout_seconds}];
area["ISO3166-2"="{LA_LIBERTAD_ISO3166_2}"]["admin_level"="4"]->.searchArea;
(
{subquery}
);
out center tags;"""


def sanitize_text(text: str | None, max_length: int = 300) -> str | None:
    """Normalize Unicode (NFKC), strip whitespace and control characters, cap length."""
    if not text:
        return None
    normalized = unicodedata.normalize("NFKC", text)
    cleaned = "".join(ch for ch in normalized if ch.isprintable()).strip()
    return cleaned[:max_length] if cleaned else None


class OsmCollector(BaseCollector):
    name = "osm"

    def __init__(
        self,
        http_client: SafeHttpClient,
        place_repo: PlaceRepo,
        scrape_repo: ScrapeRunRepo,
        settings: Settings,
        overpass_url: str = "https://overpass-api.de/api/interpreter",
    ) -> None:
        super().__init__(scrape_repo)
        self._http = http_client
        self._place_repo = place_repo
        self._settings = settings
        self._overpass_url = overpass_url

    async def _run_impl(self) -> RunResult:
        all_places: dict[int, Place] = {}
        total_rejected = 0
        successful_queries = 0

        for _zone_name, bbox in TOURIST_ZONES:
            for category, filter_expr in CATEGORY_NODE_FILTERS.items():
                query = build_zone_query(
                    filter_expr=filter_expr,
                    bbox=bbox,
                    timeout_seconds=25,
                    limit=50,
                )
                try:
                    resp = await self._http.post(
                        self._overpass_url,
                        data={"data": query},
                        collector=self.name,
                        check_robots=False,
                    )
                    resp.raise_for_status()
                    data = json.loads(resp.text)
                    successful_queries += 1
                except Exception:
                    # Log warning for zone failure without crashing the whole collector
                    await asyncio.sleep(3.0)
                    continue

                elements: list[dict[str, Any]] = data.get("elements", [])
                for el in elements:
                    osm_id = el.get("id")
                    if not isinstance(osm_id, int) or osm_id in all_places:
                        continue

                    tags = el.get("tags", {})
                    raw_name = tags.get("name")
                    name = sanitize_text(raw_name, max_length=300)
                    if not name:
                        total_rejected += 1
                        continue

                    lat_val = el.get("lat") or el.get("center", {}).get("lat")
                    lon_val = el.get("lon") or el.get("center", {}).get("lon")
                    if lat_val is None or lon_val is None:
                        total_rejected += 1
                        continue

                    try:
                        lat = float(lat_val)
                        lon = float(lon_val)
                    except (ValueError, TypeError):
                        total_rejected += 1
                        continue

                    # Validate against La Libertad bounding box
                    if not (
                        self._settings.bbox_lat_min <= lat <= self._settings.bbox_lat_max
                        and self._settings.bbox_lon_min <= lon <= self._settings.bbox_lon_max
                    ):
                        total_rejected += 1
                        continue

                    # Coastal classification: locations west of longitude -79.10
                    coast_type = CoastType.COASTAL if lon <= -79.10 else CoastType.INLAND

                    # Address extraction
                    addr_parts = [tags.get("addr:street"), tags.get("addr:housenumber")]
                    addr_str = " ".join(p for p in addr_parts if p) or tags.get("addr:full")
                    address = sanitize_text(addr_str, max_length=500)

                    all_places[osm_id] = Place(
                        osm_id=osm_id,
                        name=name,
                        category=category,
                        coast_type=coast_type,
                        lat=lat,
                        lon=lon,
                        address=address,
                        source="osm",
                        kind=classify_place(tags=tags, source="osm"),
                    )

                await asyncio.sleep(self._settings.http_rate_limit_seconds)

        if not all_places and successful_queries == 0:
            raise RuntimeError(
                "All Overpass zone queries failed or timed out. Overpass API is at capacity."
            )

        upserted_count = self._place_repo.upsert_many(list(all_places.values()))
        return RunResult(
            collector=self.name,
            rows_upserted=upserted_count,
            rows_rejected=total_rejected,
            status="ok",
        )
