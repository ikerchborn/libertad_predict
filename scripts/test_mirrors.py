import httpx

q = """[out:json][timeout:15];
node["tourism"~"^(hotel|hostel|guest_house)$"](-8.16, -79.08, -8.06, -78.98);
out center tags 30;
"""

for url in ["https://lz4.overpass-api.de/api/interpreter", "https://z.overpass-api.de/api/interpreter"]:
    try:
        r = httpx.post(url, data={"data": q}, headers={"User-Agent": "TurismoLaLibertad/1.0"}, timeout=20.0)
        print(url, "Status:", r.status_code, "Elements:", len(r.json().get("elements", [])))
    except Exception as e:
        print(url, "Error:", type(e).__name__)
