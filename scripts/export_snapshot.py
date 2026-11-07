import json
import os
import sqlite3
from datetime import UTC, datetime

os.makedirs("data/seeds", exist_ok=True)
conn = sqlite3.connect("data/turismo.db")
conn.row_factory = sqlite3.Row
c = conn.cursor()

c.execute("""
    SELECT p.id as place_id, p.name, p.kind, p.lat, p.lon, p.address as p_address,
           pd.google_place_id, pd.stars, pd.user_rating_count, pd.reviews_json,
           pd.website, pd.phone, pd.address as pd_address, pd.opening_hours,
           pd.cuisine, pd.price_level, pd.price_min, pd.price_max, pd.currency,
           pd.menu_url, pd.maps_url, pd.image_url, pd.safety_score, pd.source
    FROM places p
    LEFT JOIN place_details pd ON p.id = pd.place_id
""")
rows = c.fetchall()
places_data = []
for r in rows:
    revs = []
    if r["reviews_json"]:
        try:
            revs = json.loads(r["reviews_json"]) if isinstance(r["reviews_json"], str) else r["reviews_json"]
        except Exception:
            revs = []
    
    # Strip any googleapis / googleusercontent photo URLs
    img = r["image_url"]
    if img and ("googleapis.com" in img or "googleusercontent.com" in img):
        img = None

    lat = float(r["lat"])
    lon = float(r["lon"])
    maps_url = r["maps_url"] or f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"

    places_data.append({
        "place_id": r["place_id"],
        "name": r["name"],
        "kind": r["kind"],
        "lat": lat,
        "lon": lon,
        "google_place_id": r["google_place_id"],
        "stars": float(r["stars"]) if r["stars"] is not None else None,
        "external_rating": float(r["stars"]) if r["stars"] is not None else None,
        "user_rating_count": r["user_rating_count"],
        "reviews": revs,
        "website": r["website"],
        "phone": r["phone"],
        "address": r["pd_address"] or r["p_address"],
        "opening_hours": r["opening_hours"],
        "cuisine": r["cuisine"],
        "price_level": r["price_level"],
        "price_min": float(r["price_min"]) if r["price_min"] is not None else None,
        "price_max": float(r["price_max"]) if r["price_max"] is not None else None,
        "currency": r["currency"] or "PEN",
        "menu_url": r["menu_url"],
        "maps_url": maps_url,
        "image_url": img,
        "safety_score": float(r["safety_score"]) if r["safety_score"] is not None else None,
        "source": r["source"] or "osm"
    })

snapshot = {
    "version": "1.0",
    "exported_at": datetime.now(UTC).isoformat(),
    "total_places": len(places_data),
    "places": places_data
}

with open("data/seeds/places_google_snapshot.json", "w", encoding="utf-8") as f:
    json.dump(snapshot, f, ensure_ascii=False, indent=2)

print(f"Exported {len(places_data)} places to data/seeds/places_google_snapshot.json")
conn.close()
