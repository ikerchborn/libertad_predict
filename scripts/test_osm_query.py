import httpx

# Test 1: Hotels in Trujillo
q_hotels = """[out:json][timeout:20];
node["tourism"~"^(hotel|hostel|guest_house)$"](-8.16, -79.08, -8.06, -78.98);
out center tags 30;
"""

# Test 2: Restaurants in Trujillo
q_rest = """[out:json][timeout:20];
node["amenity"~"^(restaurant|cafe)$"](-8.16, -79.08, -8.06, -78.98);
out center tags 30;
"""

# Test 3: Attractions in Trujillo
q_attr = """[out:json][timeout:20];
(
  node["tourism"~"^(attraction|museum)$"](-8.16, -79.08, -8.06, -78.98);
  node["historic"~"^(archaeological_site|monument|ruins)$"](-8.16, -79.08, -8.06, -78.98);
);
out center tags 30;
"""

queries = [("hotels", q_hotels), ("restaurants", q_rest), ("attractions", q_attr)]

for name, q in queries:
    try:
        r = httpx.post(
            "https://overpass-api.de/api/interpreter",
            data={"data": q},
            headers={"User-Agent": "TurismoLaLibertad/1.0 (contact: info@turismolalibertad.pe)"},
            timeout=25.0,
        )
        print(f"[{name}] Status: {r.status_code}")
        if r.status_code == 200:
            elems = r.json().get("elements", [])
            print(f"[{name}] Retrieved {len(elems)} elements.")
            for e in elems[:3]:
                print(f"  - {e.get('id')}: {e.get('tags', {}).get('name')}")
        else:
            print(f"[{name}] Error: {r.text[:150]}")
    except Exception as exc:
        print(f"[{name}] Exception: {type(exc).__name__} {exc}")
