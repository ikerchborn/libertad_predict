/** Result of an OSRM request; fallback coordinates are direct connectors, not street geometry. */
export interface OsrmRouteResult {
  coordinates: [number, number][]; // [lat, lon][] for Leaflet
  distanceKm: number;
  durationMin: number;
  isFallback: boolean;
  fallbackReason?: string;
}

/**
 * Fetches routing geometry from public OSRM.
 * A fallback is only an approximate connector and must not be presented as street guidance.
 *
 * Invalid waypoint input returns `null`. Network, timeout, HTTP, or payload failures return
 * an explicitly marked approximate connector so callers can preserve the itinerary display.
 *
 * @param waypoints - At least two `[latitude, longitude]` points.
 * @param mode - Road profile to request; defaults to driving.
 */
export async function fetchOsrmRoute(
  waypoints: [number, number][], // [lat, lon][]
  mode: 'walking' | 'driving' = 'driving'
): Promise<OsrmRouteResult | null> {
  if (
    waypoints.length < 2 ||
    waypoints.some(([lat, lon]) => !Number.isFinite(lat) || !Number.isFinite(lon))
  ) {
    return null;
  }

  // Format: {lon},{lat};{lon},{lat}...
  const coordsQuery = waypoints.map(([lat, lon]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const profile = mode === 'walking' ? 'foot' : 'driving';
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coordsQuery}?overview=full&geometries=geojson`;
  let fallbackReason = 'El servicio de rutas no devolvió una ruta vial válida.';

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      fallbackReason = `El servicio de rutas respondió con estado ${res.status}.`;
      throw new Error(fallbackReason);
    }
    const data = await res.json();
    const route = data.routes?.[0];

    if (!route || !route.geometry?.coordinates) {
      throw new Error('No route in OSRM payload');
    }
    if (
      route.geometry.coordinates.length < 2 ||
      route.geometry.coordinates.some(
        (coordinate: unknown) =>
          !Array.isArray(coordinate) ||
          coordinate.length < 2 ||
          !Number.isFinite(coordinate[0]) ||
          !Number.isFinite(coordinate[1])
      )
    ) {
      throw new Error('Invalid route geometry in OSRM payload');
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
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      fallbackReason = 'El cálculo de calles excedió 4 segundos.';
    } else if (error instanceof Error && error.message !== fallbackReason) {
      fallbackReason = 'No se pudo validar la ruta sobre la red vial.';
    }
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
      fallbackReason,
    };
  }
}
