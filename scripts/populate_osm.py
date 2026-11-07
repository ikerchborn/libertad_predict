"""Populate real OSM places via Nominatim when Overpass is at capacity.

Nominatim: https://nominatim.openstreetmap.org
Terms: https://operations.osmfoundation.org/policies/nominatim/
  - 1 req/sec maximum; user-agent mandatory; no bulk geocoding.
  - We use structured amenity search in a viewbox, which is allowed.

NOTE: Nominatim's structured search only accepts `amenity=` as a tag filter.
  OSM tourism=hotel/hostel/guest_house, tourism=museum etc. are also indexed
  in Nominatim under amenity (hotels) or general POI. We query all categories
  as amenity values, since Nominatim does not accept `tourism=` as a param.

We search per category per zone, deduplicate by osm_id, validate coordinates
against La Libertad bounding box, and upsert via the existing PlaceRepo
(manual-source rows are protected by the WHERE clause in upsert).
"""
import asyncio
import unicodedata
import httpx

from turismo.config import Settings
from turismo.domain.models import CoastType, Place, PlaceCategory
from turismo.infrastructure.db.repositories import PlaceRepo
from turismo.infrastructure.db.session import create_engine, make_session_factory

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "TurismoLaLibertad/1.0 (contact: info@turismolalibertad.pe)"

# Focused zones as (name, (south, west, north, east))
ZONES: list[tuple[str, tuple[float, float, float, float]]] = [
    ("Trujillo Centro",   (-8.133, -79.050, -8.098, -79.010)),
    ("Trujillo Norte",    (-8.099, -79.065, -8.070, -79.015)),
    ("Huanchaco",         (-8.092, -79.140, -8.062, -79.105)),
    ("Chicama/Malabrigo", (-7.860, -79.465, -7.830, -79.428)),
    ("Huamachuco",        (-7.835, -78.068, -7.795, -78.033)),
]

# Nominatim amenity= values mapped to our domain categories
# Nominatim only understands amenity= in its structured endpoint;
# tourism=hotel OSM nodes are returned when searching amenity=hotel.
CATEGORY_QUERIES: list[tuple[PlaceCategory, str]] = [
    (PlaceCategory.HOTEL, "hotel"),
    (PlaceCategory.HOTEL, "hostel"),
    (PlaceCategory.HOTEL, "guest_house"),
    (PlaceCategory.HOTEL, "motel"),
    (PlaceCategory.RESTAURANT, "restaurant"),
    (PlaceCategory.RESTAURANT, "cafe"),
    (PlaceCategory.ATTRACTION, "museum"),
    (PlaceCategory.ATTRACTION, "archaeological_site"),
    (PlaceCategory.ATTRACTION, "monument"),
    (PlaceCategory.ATTRACTION, "arts_centre"),
]

# La Libertad bounding box for final validation
BBOX_LAT_MIN = -8.5
BBOX_LAT_MAX = -7.5
BBOX_LON_MIN = -79.6
BBOX_LON_MAX = -77.8


def sanitize(text: str | None, max_len: int = 300) -> str | None:
    if not text:
        return None
    normalized = unicodedata.normalize("NFKC", text)
    cleaned = "".join(ch for ch in normalized if ch.isprintable()).strip()
    return cleaned[:max_len] if cleaned else None


async def fetch_nominatim(
    client: httpx.AsyncClient,
    amenity_value: str,
    bbox: tuple[float, float, float, float],
) -> list[dict]:
    s, w, n, e = bbox
    params = {
        "format": "jsonv2",
        "addressdetails": "0",
        "namedetails": "0",
        "extratags": "1",
        "limit": "50",
        "viewbox": f"{w},{n},{e},{s}",
        "bounded": "1",
        "amenity": amenity_value,
    }
    try:
        r = await client.get(NOMINATIM_URL, params=params, timeout=12.0)
        if r.status_code == 200:
            return r.json()
        print(f"    Nominatim amenity={amenity_value}: HTTP {r.status_code}")
        return []
    except Exception as exc:
        print(f"    Nominatim amenity={amenity_value}: {type(exc).__name__}")
        return []


async def collect_all() -> None:
    settings = Settings()
    engine = create_engine(settings.database_url)
    factory = make_session_factory(engine)
    all_places: dict[int, Place] = {}

    # Nominatim policy: max 1 request/second
    rate_delay = 1.3

    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
        for z_name, bbox in ZONES:
            print(f"\nZone: {z_name}")
            for cat, amenity_value in CATEGORY_QUERIES:
                items = await fetch_nominatim(client, amenity_value, bbox)
                added = 0
                for item in items:
                    raw_id = item.get("osm_id")
                    if not isinstance(raw_id, int):
                        try:
                            raw_id = int(raw_id)
                        except (TypeError, ValueError):
                            continue
                    if raw_id in all_places:
                        continue

                    name = sanitize(item.get("name") or item.get("display_name", "").split(",")[0])
                    if not name:
                        continue

                    try:
                        lat = float(item.get("lat", 0))
                        lon = float(item.get("lon", 0))
                    except (TypeError, ValueError):
                        continue

                    if not (BBOX_LAT_MIN <= lat <= BBOX_LAT_MAX and BBOX_LON_MIN <= lon <= BBOX_LON_MAX):
                        continue

                    coast_type = CoastType.COASTAL if lon <= -79.10 else CoastType.INLAND
                    extra = item.get("extratags") or {}
                    addr = sanitize(extra.get("addr:street") or extra.get("addr:full"))

                    all_places[raw_id] = Place(
                        osm_id=raw_id,
                        name=name,
                        category=cat,
                        coast_type=coast_type,
                        lat=lat,
                        lon=lon,
                        address=addr,
                        source="osm",
                    )
                    added += 1

                print(f"  amenity={amenity_value}: {len(items)} fetched, {added} new unique")
                await asyncio.sleep(rate_delay)

    total_unique = len(all_places)
    by_cat: dict[str, int] = {}
    for p in all_places.values():
        by_cat[p.category.value] = by_cat.get(p.category.value, 0) + 1

    print(f"\nTotal unique places collected: {total_unique}")
    for c, count in sorted(by_cat.items()):
        print(f"  {c}: {count}")

    with factory() as session:
        repo = PlaceRepo(session)
        upserted = repo.upsert_many(list(all_places.values()))
        session.commit()
        print(f"Upserted {upserted} places into DB (manual rows unchanged).")


if __name__ == "__main__":
    asyncio.run(collect_all())
