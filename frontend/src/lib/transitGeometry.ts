/** Shares verified pedestrian route requests and measures route polylines. */
import { haversineKm } from '@/lib/routeOptimizer';
import { fetchOsrmRoute, type OsrmRouteResult } from '@/lib/osrmService';

const walkingRouteCache = new Map<string, Promise<OsrmRouteResult | null>>();

/**
 * Reuses in-flight/successful pedestrian requests; failed and approximate results are not cached.
 */
export function getWalkingRoute(
  origin: [number, number],
  destination: [number, number]
): Promise<OsrmRouteResult | null> {
  const key = `${origin.join(',')}>${destination.join(',')}`;
  const cached = walkingRouteCache.get(key);
  if (cached) return cached;

  const route = fetchOsrmRoute([origin, destination], 'walking');
  walkingRouteCache.set(key, route);
  void route.then(
    (result) => {
      if (!result || result.isFallback) walkingRouteCache.delete(key);
    },
    () => {
      walkingRouteCache.delete(key);
    }
  );
  return route;
}

/** Sums great-circle distances between consecutive `[latitude, longitude]` polyline points. */
export function getPolylineDistanceKm(coordinates: [number, number][]): number {
  let distance = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    distance += haversineKm(
      coordinates[index - 1][0],
      coordinates[index - 1][1],
      coordinates[index][0],
      coordinates[index][1]
    );
  }
  return distance;
}
