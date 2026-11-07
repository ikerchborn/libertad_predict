import sqlite3
from urllib.parse import quote_plus

# Accurate verified geographic coordinates (WGS84)
VERIFIED_COORDS = {
    1: {"name": "Centro Histórico de Trujillo", "lat": -8.111786, "lon": -79.028667},
    2: {"name": "Balneario de Huanchaco", "lat": -8.078560, "lon": -79.121384},
    3: {"name": "Complejo Arqueológico Chan Chan", "lat": -8.109858, "lon": -79.074533},
    4: {"name": "Huacas del Sol y de la Luna", "lat": -8.133583, "lon": -78.990853},
    5: {"name": "Puerto Chicama (Malabrigo)", "lat": -7.694431, "lon": -79.438941},
    6: {"name": "Marcahuamachuco", "lat": -7.787071, "lon": -78.076645},
}

conn = sqlite3.connect("data/turismo.db")
c = conn.cursor()

# 1. Update places table for the 6 core destinations
for pid, info in VERIFIED_COORDS.items():
    c.execute(
        "UPDATE places SET lat = ?, lon = ? WHERE id = ?",
        (info["lat"], info["lon"], pid),
    )
    print(f"Updated place #{pid} ({info['name']}) -> lat: {info['lat']}, lon: {info['lon']}")

# 2. Update maps_url for all places in place_details to match exact coordinates
c.execute("SELECT p.id, p.name, p.lat, p.lon FROM places p")
all_places = c.fetchall()
for pid, name, lat, lon in all_places:
    maps_url = f"https://www.google.com/maps/search/?api=1&query={quote_plus(name)}+{lat:.6f},{lon:.6f}"
    c.execute(
        "UPDATE place_details SET maps_url = ? WHERE place_id = ?",
        (maps_url, pid),
    )

print(f"Updated maps_url for {len(all_places)} places in place_details.")

# 3. Update locations table coordinates
LOC_COORDS = {
    "Trujillo": (-8.111786, -79.028667),
    "Huanchaco": (-8.078560, -79.121384),
    "Chan Chan": (-8.109858, -79.074533),
    "Huacas de Moche": (-8.133583, -78.990853),
    "Chicama": (-7.694431, -79.438941),
    "Huamachuco": (-7.787071, -78.076645),
}
for loc_name, (lat, lon) in LOC_COORDS.items():
    c.execute(
        "UPDATE locations SET lat = ?, lon = ? WHERE name = ?",
        (lat, lon, loc_name),
    )
    print(f"Updated location {loc_name} -> {lat}, {lon}")

conn.commit()
conn.close()
print("Coordinates update complete!")
