export interface OsrmRouteResult {
  coordinates: [number, number][]; // [lat, lon][] for Leaflet
  distanceKm: number;
  durationMin: number;
  isFallback: boolean;
}

/**
 * Fetches street-level routing geometry from public OSRM.
 * Falls back to straight connections if OSRM is unreachable or throttled.
 */
export async function fetchOsrmRoute(
  waypoints: [number, number][], // [lat, lon][]
  mode: 'walking' | 'driving' = 'driving'
): Promise<OsrmRouteResult | null> {
  if (waypoints.length < 2) return null;

  // Format: {lon},{lat};{lon},{lat}...
  const coordsQuery = waypoints.map(([lat, lon]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const profile = mode === 'walking' ? 'foot' : 'driving';
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coordsQuery}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`OSRM error: ${res.status}`);
    const data = await res.json();
    const route = data.routes?.[0];

    if (!route || !route.geometry?.coordinates) {
      throw new Error('No route in OSRM payload');
    }

    // OSRM GeoJSON is [lon, lat], convert to Leaflet [lat, lon]
    const leafletCoords: [number, number][] = route.geometry.coordinates.map(
      (coord: [number, number]) => [coord[1], coord[0]]
    );

    return {
      coordinates: leafletCoords,
      distanceKm: (route.distance || 0) / 1000,
      durationMin: Math.round((route.duration || 0) / 60),
      isFallback: false,
    };
  } catch {
    // Fallback: direct waypoint connections
    let totalKm = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const [lat1, lon1] = waypoints[i];
      const [lat2, lon2] = waypoints[i + 1];
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      totalKm += 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    return {
      coordinates: waypoints,
      distanceKm: totalKm,
      durationMin: Math.round(mode === 'walking' ? (totalKm / 4.5) * 60 : (totalKm / 35) * 60),
      isFallback: true,
    };
  }
}
