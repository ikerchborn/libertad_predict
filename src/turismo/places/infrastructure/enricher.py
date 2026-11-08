"""One-shot enrichment and seeding of commercial places and attractions."""
from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast
from urllib.parse import quote_plus

import httpx

from turismo.places.domain.models import Offer, PlaceDetail, PlaceKind, PlaceReview
from turismo.shared.collector import BaseCollector
from turismo.shared.models import RunResult

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from turismo.places.infrastructure.repository import PlaceRepo
    from turismo.shared.db import ScrapeRunRepo
    from turismo.shared.http import SafeHttpClient

SNAPSHOT_PATH = Path("data/seeds/places_google_snapshot.json")

GOOGLE_PRICE_LEVEL_MAP: dict[str, int] = {
    "PRICE_LEVEL_INEXPENSIVE": 1,
    "PRICE_LEVEL_MODERATE": 2,
    "PRICE_LEVEL_EXPENSIVE": 3,
    "PRICE_LEVEL_VERY_EXPENSIVE": 4,
}


def build_maps_url(name: str, lat: float, lon: float) -> str:
    """Build passive Google Maps / OSM search URL (zero cost link)."""
    query = quote_plus(f"{name} {lat:.6f},{lon:.6f}")
    return f"https://www.google.com/maps/search/?api=1&query={query}"


def parse_json_ld(html_text: str) -> list[dict[str, Any]]:
    """Extract schema.org JSON-LD objects from raw HTML text."""
    import re

    results: list[dict[str, Any]] = []
    pattern = re.compile(
        r'<script[^>]*type=[\'"]application/ld\+json[\'"][^>]*>(.*?)</script>',
        re.DOTALL | re.IGNORECASE,
    )
    for match in pattern.finditer(html_text):
        try:
            data = json.loads(match.group(1).strip())
            if isinstance(data, list):
                results.extend([x for x in data if isinstance(x, dict)])
            elif isinstance(data, dict):
                if "@graph" in data and isinstance(data["@graph"], list):
                    results.extend([x for x in data["@graph"] if isinstance(x, dict)])
                else:
                    results.append(data)
        except Exception as exc:
            logger.debug("Failed to parse JSON-LD snippet: %s", exc)
            continue
    return results


async def fetch_google_place_enrichment(
    client: httpx.AsyncClient,
    api_key: str,
    name: str,
    lat: float,
    lon: float,
) -> dict[str, Any] | None:
    """Query Google Places API (New) Text Search with location bias (NO photos requested)."""
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": (
            "places.id,places.displayName,places.rating,places.userRatingCount,"
            "places.websiteUri,places.internationalPhoneNumber,places.priceLevel,"
            "places.regularOpeningHours.weekdayDescriptions,places.reviews,"
            "places.googleMapsUri"
        ),
    }
    body = {
        "textQuery": f"{name} La Libertad Peru",
        "maxResultCount": 1,
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lon},
                "radius": 2500.0,
            }
        },
        "languageCode": "es",
    }
    try:
        resp = await client.post(
            "https://places.googleapis.com/v1/places:searchText",
            headers=headers,
            json=body,
            timeout=10.0,
        )
        if resp.status_code != 200:
            return None
        places_list = resp.json().get("places", [])
        if not places_list or not isinstance(places_list[0], dict):
            return None
        return cast(dict[str, Any], places_list[0])
    except Exception as exc:
        logger.debug("Google Places API lookup failed for %s: %s", name, exc)
        return None


class CommercialEnricher(BaseCollector):
    name = "commercial_enricher"

    def __init__(
        self,
        place_repo: PlaceRepo,
        scrape_repo: ScrapeRunRepo,
        http_client: SafeHttpClient | None = None,
        google_places_api_key: str | None = None,
        max_google_lookups: int = 120,
        snapshot_path: Path = SNAPSHOT_PATH,
    ) -> None:
        super().__init__(scrape_repo)
        self._place_repo = place_repo
        self._http = http_client
        self._google_api_key = google_places_api_key
        self._max_google_lookups = max_google_lookups
        self._snapshot_path = snapshot_path

    def _load_snapshot(self) -> dict[int, dict[str, Any]]:
        if not self._snapshot_path.exists():
            return {}
        try:
            with self._snapshot_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            places_list = data.get("places", [])
            return {
                int(p["place_id"]): p
                for p in places_list
                if "place_id" in p
            }
        except Exception as exc:
            logger.warning("Failed to load places snapshot from %s: %s", self._snapshot_path, exc)
            return {}

    def _export_snapshot(self) -> None:
        try:
            self._snapshot_path.parent.mkdir(parents=True, exist_ok=True)
            places = self._place_repo.list_all(include_unclassified=False)
            snapshot_items: list[dict[str, Any]] = []

            for p in places:
                if p.id is None:
                    continue
                d = self._place_repo.get_place_detail(p.id)
                maps_url = (
                    d.maps_url
                    if d
                    else build_maps_url(p.name, p.lat, p.lon)
                )
                img = d.image_url if d else None
                if img and ("googleapis.com" in img or "googleusercontent.com" in img):
                    img = None

                snapshot_items.append({
                    "place_id": p.id,
                    "name": p.name,
                    "kind": p.kind.value,
                    "lat": p.lat,
                    "lon": p.lon,
                    "google_place_id": d.google_place_id if d else None,
                    "stars": d.stars if d else None,
                    "external_rating": d.stars if d else None,
                    "user_rating_count": d.user_rating_count if d else None,
                    "reviews": [rv.model_dump() for rv in d.reviews] if d and d.reviews else [],
                    "website": d.website if d else None,
                    "phone": d.phone if d else None,
                    "address": (d.address if d else None) or p.address,
                    "opening_hours": d.opening_hours if d else None,
                    "cuisine": d.cuisine if d else None,
                    "price_level": d.price_level if d else None,
                    "price_min": d.price_min if d else None,
                    "price_max": d.price_max if d else None,
                    "currency": (d.currency if d else None) or "PEN",
                    "menu_url": d.menu_url if d else None,
                    "maps_url": maps_url,
                    "image_url": img,
                    "local_image_path": d.local_image_path if d else None,
                    "safety_score": d.safety_score if d else None,
                    "source": (d.source if d else None) or "osm",
                })

            data = {
                "version": "1.0",
                "exported_at": datetime.now(UTC).isoformat(),
                "total_places": len(snapshot_items),
                "places": snapshot_items,
            }
            with self._snapshot_path.open("w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            logger.info(
                "Exported snapshot with %d places to %s",
                len(snapshot_items),
                self._snapshot_path,
            )
        except Exception as exc:
            logger.error("Failed to export places snapshot: %s", exc)

    async def _run_impl(self) -> RunResult:
        places = self._place_repo.list_all(include_unclassified=False)
        snapshot_map = self._load_snapshot()
        total_enriched = 0
        google_calls = 0

        assigned_google_ids: set[str] = set()
        for p in places:
            if p.id is not None:
                d = self._place_repo.get_place_detail(p.id)
                if d and d.google_place_id:
                    assigned_google_ids.add(d.google_place_id)

        async with httpx.AsyncClient() as g_client:
            for p in places:
                if p.id is None:
                    continue

                existing = self._place_repo.get_place_detail(p.id)
                snap = snapshot_map.get(p.id)

                maps_url = build_maps_url(p.name, p.lat, p.lon)
                website = existing.website if existing else (snap.get("website") if snap else None)
                phone = existing.phone if existing else (snap.get("phone") if snap else None)
                hours = existing.opening_hours if existing else (
                    snap.get("opening_hours") if snap else None
                )
                cuisine = existing.cuisine if existing else (snap.get("cuisine") if snap else None)
                stars = existing.stars if existing else (
                    snap.get("stars") if snap and snap.get("stars") is not None else None
                )
                user_rating_count = (
                    existing.user_rating_count
                    if existing
                    else (snap.get("user_rating_count") if snap else None)
                )
                google_place_id = (
                    existing.google_place_id
                    if existing
                    else (snap.get("google_place_id") if snap else None)
                )
                if (
                    google_place_id
                    and not (existing and existing.google_place_id == google_place_id)
                ):
                    if google_place_id in assigned_google_ids:
                        google_place_id = None
                    else:
                        assigned_google_ids.add(google_place_id)
                local_image_path = (
                    existing.local_image_path
                    if existing
                    else (snap.get("local_image_path") if snap else None)
                )
                price_level = (
                    existing.price_level
                    if existing
                    else (snap.get("price_level") if snap else None)
                )
                price_min = (
                    existing.price_min if existing else (snap.get("price_min") if snap else None)
                )
                price_max = (
                    existing.price_max if existing else (snap.get("price_max") if snap else None)
                )
                menu_url = (
                    existing.menu_url if existing else (snap.get("menu_url") if snap else None)
                )
                image_url = (
                    existing.image_url if existing else (snap.get("image_url") if snap else None)
                )
                safety_score = (
                    existing.safety_score
                    if existing
                    else (snap.get("safety_score") if snap else None)
                )
                source_tag = existing.source if existing else (
                    snap.get("source", "osm") if snap else "osm"
                )

                if image_url and (
                    "googleapis.com" in image_url or "googleusercontent.com" in image_url
                ):
                    image_url = None

                reviews: list[PlaceReview] = []
                if existing and existing.reviews:
                    reviews = list(existing.reviews)
                elif snap and snap.get("reviews"):
                    for rv in snap["reviews"]:
                        if isinstance(rv, dict) and rv.get("text"):
                            reviews.append(
                                PlaceReview(
                                    author_name=rv.get("author_name", "Visitante")[:120],
                                    rating=float(rv.get("rating", 5.0)),
                                    text=rv.get("text", "")[:1000],
                                    relative_time=rv.get("relative_time"),
                                )
                            )

                if (
                    self._google_api_key
                    and google_calls < self._max_google_lookups
                    and stars is None
                    and google_place_id is None
                ):
                    g_data = await fetch_google_place_enrichment(
                        g_client, self._google_api_key, p.name, p.lat, p.lon
                    )
                    google_calls += 1
                    if g_data is not None:
                        source_tag = "google_places"
                        new_gid = str(g_data.get("id")) if g_data.get("id") else None
                        if new_gid and new_gid not in assigned_google_ids:
                            google_place_id = new_gid
                            assigned_google_ids.add(new_gid)
                        else:
                            google_place_id = None
                        if "rating" in g_data and g_data["rating"] is not None:
                            stars = round(float(g_data["rating"]), 1)
                        if "userRatingCount" in g_data and g_data["userRatingCount"] is not None:
                            user_rating_count = int(g_data["userRatingCount"])
                        if not website and g_data.get("websiteUri"):
                            website = str(g_data["websiteUri"])[:500]
                        if not phone and g_data.get("internationalPhoneNumber"):
                            phone = str(g_data["internationalPhoneNumber"])[:50]
                        if g_data.get("googleMapsUri"):
                            maps_url = str(g_data["googleMapsUri"])[:500]
                        if price_level is None and g_data.get("priceLevel"):
                            price_level = GOOGLE_PRICE_LEVEL_MAP.get(str(g_data["priceLevel"]))
                        if not hours:
                            weekday_desc = g_data.get("regularOpeningHours", {}).get(
                                "weekdayDescriptions", []
                            )
                            if isinstance(weekday_desc, list) and weekday_desc:
                                hours = "; ".join(str(x) for x in weekday_desc[:2])[:200]

                        raw_revs = g_data.get("reviews", [])
                        if isinstance(raw_revs, list) and not reviews:
                            parsed_revs: list[PlaceReview] = []
                            for rv in raw_revs[:3]:
                                if not isinstance(rv, dict):
                                    continue
                                txt_obj = rv.get("text") or rv.get("originalText") or {}
                                txt = (
                                    txt_obj.get("text", "").strip()
                                    if isinstance(txt_obj, dict)
                                    else ""
                                )
                                author = (
                                    rv.get("authorAttribution", {}).get("displayName", "Visitante")
                                    if isinstance(rv.get("authorAttribution"), dict)
                                    else "Visitante"
                                )
                                r_val = rv.get("rating")
                                if txt and r_val is not None:
                                    parsed_revs.append(
                                        PlaceReview(
                                            author_name=str(author)[:120],
                                            rating=float(r_val),
                                            text=txt[:1000],
                                            relative_time=str(
                                                rv.get("relativePublishTimeDescription", "")
                                            )[:100]
                                            or None,
                                        )
                                    )
                            reviews = parsed_revs

                new_offers: list[Offer] = []
                if website and self._http is not None:
                    try:
                        resp = await self._http.get(
                            website,
                            collector=self.name,
                            check_robots=True,
                        )
                        if resp.status_code == 200:
                            ld_objects = parse_json_ld(resp.text)
                            for obj in ld_objects:
                                if "telephone" in obj and not phone:
                                    phone = str(obj["telephone"])[:50]
                                if "openingHours" in obj and not hours:
                                    hours = str(obj["openingHours"])[:200]
                                if "hasMenu" in obj and not menu_url:
                                    menu_url = str(obj["hasMenu"])[:500]
                                if "starRating" in obj and stars is None:
                                    r_val = obj["starRating"].get("ratingValue")
                                    if r_val is not None:
                                        stars = float(r_val)

                                raw_offers = obj.get("makesOffer") or obj.get("hasMenuItem") or []
                                if isinstance(raw_offers, list):
                                    for ro in raw_offers:
                                        if (
                                            isinstance(ro, dict)
                                            and "name" in ro
                                            and "price" in ro
                                        ):
                                            try:
                                                new_offers.append(
                                                    Offer(
                                                        place_id=p.id,
                                                        kind=(
                                                            "room"
                                                            if p.kind == PlaceKind.LODGING
                                                            else (
                                                                "tour"
                                                                if p.kind == PlaceKind.ACTIVITY
                                                                else "dish"
                                                            )
                                                        ),
                                                        name=str(ro["name"])[:200],
                                                        price=float(ro["price"]),
                                                        currency=str(
                                                            ro.get("priceCurrency", "PEN")
                                                        )[:10],
                                                        captured_at=datetime.now(UTC),
                                                    )
                                                )
                                            except (ValueError, TypeError):
                                                continue
                    except Exception as exc:
                        logger.debug("Failed structured data extraction for %s: %s", website, exc)

                detail = PlaceDetail(
                    place_id=p.id,
                    website=website,
                    phone=phone,
                    address=p.address,
                    opening_hours=hours,
                    cuisine=cuisine,
                    stars=stars,
                    user_rating_count=user_rating_count,
                    price_level=price_level,
                    price_min=price_min,
                    price_max=price_max,
                    currency="PEN",
                    menu_url=menu_url,
                    maps_url=maps_url,
                    image_url=image_url,
                    local_image_path=local_image_path,
                    google_place_id=google_place_id,
                    reviews=reviews,
                    safety_score=safety_score,
                    source=source_tag,
                    fetched_at=datetime.now(UTC),
                )
                self._place_repo.upsert_place_detail(detail)
                total_enriched += 1

                if new_offers:
                    self._place_repo.add_offers(new_offers)

        self._export_snapshot()

        return RunResult(
            collector=self.name,
            rows_upserted=total_enriched,
            rows_rejected=0,
            status="ok",
        )
