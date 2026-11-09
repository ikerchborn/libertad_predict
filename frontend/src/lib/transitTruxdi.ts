/** Resolves Truxdi's route geometry and stop inventory into feasible transit legs. */
import type { Place } from '@/lib/types';
import { haversineKm } from '@/lib/routeOptimizer';
import type { OsrmRouteResult } from '@/lib/osrmService';
import type { CatalogConfidence, TransitOption, TruxdiDirection, TruxdiRoute } from '@/lib/transitTypes';
import { isTransitWalkOverLimitKm, MAX_TRANSIT_WALK_KM } from '@/lib/transitPolicy';
import { getRouteColor, loadTruxdiRoutes, TEXT_ON_DARK } from '@/lib/transitCatalogData';
import { findNearbyReadableStopName, sanitizeStopName } from '@/lib/transitCatalog';
import { getPolylineDistanceKm, getWalkingRoute } from '@/lib/transitGeometry';

const truxdiGeometryDistanceCache = new Map<string, number>();
const truxdiCandidatesCache = new Map<string, Array<{ transit: TransitOption; totalEstimatedMinutes: number }>>();

function sliceTruxdiGeometry(
  geometry: [number, number][],
  startPosition: number,
  endPosition: number
): [number, number][] | null {
  if (
    geometry.length < 2 ||
    !Number.isFinite(startPosition) ||
    !Number.isFinite(endPosition) ||
    startPosition < 0 ||
    endPosition <= startPosition ||
    endPosition > geometry.length - 1
  ) {
    return null;
  }

  const interpolate = (position: number): [number, number] => {
    const index = Math.floor(position);
    const fraction = position - index;
    const start = geometry[index];
    const end = geometry[Math.min(index + 1, geometry.length - 1)];
    return [
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction,
    ];
  };
  const segment: [number, number][] = [interpolate(startPosition)];
  for (
    let index = Math.floor(startPosition) + 1;
    index < endPosition;
    index += 1
  ) {
    segment.push(geometry[index]);
  }
  segment.push(interpolate(endPosition));
  return segment.map(([longitude, latitude]) => [latitude, longitude]);
}

function getTruxdiFullRouteDistanceKm(
  route: TruxdiRoute,
  direction: TruxdiDirection,
  geometry: [number, number][]
): number {
  const key = `${route.route_id}:${direction}`;
  const cachedDistance = truxdiGeometryDistanceCache.get(key);
  if (cachedDistance !== undefined) return cachedDistance;

  const distance = getPolylineDistanceKm(
    geometry.map(([longitude, latitude]) => [latitude, longitude])
  );
  truxdiGeometryDistanceCache.set(key, distance);
  return distance;
}

function getTruxdiTransitCandidates(
  origin: Place,
  destination: Place,
  routes: TruxdiRoute[]
): Array<{ transit: TransitOption; totalEstimatedMinutes: number }> {
  const cacheKey = `${origin.lat},${origin.lon}>${destination.lat},${destination.lon}`;
  const cachedCandidates = truxdiCandidatesCache.get(cacheKey);
  if (cachedCandidates) return cachedCandidates;

  const candidates: Array<{ transit: TransitOption; totalEstimatedMinutes: number }> = [];
  const maxStopAccessKm = MAX_TRANSIT_WALK_KM;

  for (const route of routes) {
    if (
      !route.vehicle_type ||
      typeof route.fare?.standard !== 'number' ||
      !Number.isFinite(route.fare.standard)
    ) {
      continue;
    }

    for (const direction of ['ida', 'vuelta'] as const) {
      const geometry =
        direction === 'ida' ? route.geometry_ida : route.geometry_vuelta;
      if (!Array.isArray(geometry) || geometry.length < 2) continue;

      const sourceDirection = route.direction_sources.find((source) =>
        direction === 'vuelta'
          ? source.direction === 'inbound'
          : source.direction === 'outbound' || source.direction === 'loop'
      );
      const geometryVerified =
        direction === 'ida'
          ? route.geometry_ida_verified
          : route.geometry_vuelta_verified;
      const stops = route.stops
        .filter(
          (stop) =>
            stop.direction === direction &&
            typeof stop.geometry_position === 'number' &&
            (stop.geometry_distance_m ?? Infinity) <= 50
        )
        .sort((left, right) => left.position - right.position);
      if (stops.length < 2) continue;
      const fullRouteDistanceKm = getTruxdiFullRouteDistanceKm(
        route,
        direction,
        geometry
      );

      const boardingCandidates = stops
        .map((stop) => ({
          stop,
          distanceKm: haversineKm(
            origin.lat,
            origin.lon,
            stop.coordinates[1],
            stop.coordinates[0]
          ),
        }))
        .filter(({ distanceKm }) => distanceKm <= maxStopAccessKm)
        .sort((left, right) => left.distanceKm - right.distanceKm)
        .slice(0, 3);

      for (const boarding of boardingCandidates) {
        const alightingCandidates = stops
          .filter(
            (stop) =>
              stop.position > boarding.stop.position &&
              (stop.geometry_position ?? -1) >
                (boarding.stop.geometry_position ?? -1)
          )
          .map((stop) => ({
            stop,
            distanceKm: haversineKm(
              destination.lat,
              destination.lon,
              stop.coordinates[1],
              stop.coordinates[0]
            ),
          }))
          .filter(({ distanceKm }) => distanceKm <= maxStopAccessKm)
          .sort((left, right) => left.distanceKm - right.distanceKm)
          .slice(0, 3);

        for (const alighting of alightingCandidates) {
          const routeGeometry = sliceTruxdiGeometry(
            geometry,
            boarding.stop.geometry_position!,
            alighting.stop.geometry_position!
          );
          if (!routeGeometry || routeGeometry.length < 2) continue;

          const routeDistanceKm = getPolylineDistanceKm(routeGeometry);
          if (routeDistanceKm < 0.1) continue;
          const estimatedMinutes =
            route.estimated_minutes && fullRouteDistanceKm > 0
              ? Math.max(
                  2,
                  Math.round(
                    (route.estimated_minutes * routeDistanceKm) /
                      fullRouteDistanceKm
                  )
                )
              : Math.max(2, Math.round((routeDistanceKm / 18) * 60));
          const routeCode =
            route.route_code ?? route.source_route_code ?? route.route_id;
          const badgeColor = route.badge_color ?? getRouteColor(routeCode);
          const boardingStopName = sanitizeStopName(
            boarding.stop.name,
            boarding.stop.coordinates,
            boarding.stop.street ??
              boarding.stop.address ??
              boarding.stop.urbanization ??
              boarding.stop.sector ??
              findNearbyReadableStopName(stops, boarding.stop)
          );
          const dropoffStopName = sanitizeStopName(
            alighting.stop.name,
            alighting.stop.coordinates,
            alighting.stop.street ??
              alighting.stop.address ??
              alighting.stop.urbanization ??
              alighting.stop.sector ??
              findNearbyReadableStopName(stops, alighting.stop)
          );
          const walkMinutes =
            ((boarding.distanceKm + alighting.distanceKm) / 4.5) * 60 * 1.3;
          const waitMinutes = 6;
          const confidence: CatalogConfidence = geometryVerified
            ? 'alta'
            : (sourceDirection?.confidence ?? 0) >= 0.5
              ? 'media'
              : 'baja';

          candidates.push({
            totalEstimatedMinutes: walkMinutes + waitMinutes + estimatedMinutes,
            transit: {
              code: routeCode,
              serviceName:
                route.route_name ??
                route.company_name ??
                `Ruta ${routeCode}`,
              vehicleType: route.vehicle_type,
              farePen: route.fare.standard,
              fareRangePen: [route.fare.standard, route.fare.standard],
              estimatedMinutes,
              waitMinutes,
              boardingStop: boardingStopName,
              dropoffStop: dropoffStopName,
              boardingPoint: [
                boarding.stop.coordinates[1],
                boarding.stop.coordinates[0],
              ],
              dropoffPoint: [
                alighting.stop.coordinates[1],
                alighting.stop.coordinates[0],
              ],
              instructions: `Camina hasta ${boardingStopName}, sube a ${route.company_name ?? routeCode} (${routeCode}) y baja en ${dropoffStopName}.`,
              confidence,
              source: `Truxdi · ${sourceDirection?.review_status ?? 'revision pendiente'}`,
              routeGeometry,
              routeGeometryVerified: geometryVerified,
              routeDistanceKm,
              vehicleImageUrl: route.vehicle_image_url ?? undefined,
              routeColor: badgeColor,
              routeCode,
              companyName: route.company_name ?? route.route_name ?? routeCode,
              badgeColor,
              textColor: route.text_color ?? TEXT_ON_DARK,
              boardingLandmarkHint:
                boarding.stop.landmark_hint,
              dropoffLandmarkHint:
                alighting.stop.landmark_hint,
            },
          });
        }
      }
    }
  }

  const sortedCandidates = candidates.sort(
    (left, right) => left.totalEstimatedMinutes - right.totalEstimatedMinutes
  );
  if (truxdiCandidatesCache.size >= 250) truxdiCandidatesCache.clear();
  truxdiCandidatesCache.set(cacheKey, sortedCandidates);
  return sortedCandidates;
}

/**
 * Finds the fastest feasible Truxdi option among the leading route candidates.
 *
 * Access walks over the shared distance limit are rejected. Returns `null` when no candidate
 * has usable geometry, valid stops, and acceptable access distance.
 */
export async function resolveTruxdiTransit(
  origin: Place,
  destination: Place
): Promise<TransitOption | null> {
  const routes = await loadTruxdiRoutes();
  const candidates = getTruxdiTransitCandidates(origin, destination, routes);
  for (const candidate of candidates.slice(0, 2)) {
    const transit = candidate.transit;
    const accessDistances = [
      haversineKm(
        origin.lat,
        origin.lon,
        transit.boardingPoint[0],
        transit.boardingPoint[1]
      ),
      haversineKm(
        transit.dropoffPoint[0],
        transit.dropoffPoint[1],
        destination.lat,
        destination.lon
      ),
    ];
    const accessRoutes: Array<OsrmRouteResult | null> = await Promise.all([
      accessDistances[0] > 0.05
        ? getWalkingRoute([origin.lat, origin.lon], transit.boardingPoint)
        : Promise.resolve(null),
      accessDistances[1] > 0.05
        ? getWalkingRoute(transit.dropoffPoint, [destination.lat, destination.lon])
        : Promise.resolve(null),
    ]);
    const inaccessible = accessRoutes.some((route, index) => {
      if (!route) return accessDistances[index] > 0.05;
      if (isTransitWalkOverLimitKm(route.distanceKm)) return true;
      return route.isFallback &&
        isTransitWalkOverLimitKm(accessDistances[index]);
    });
    if (inaccessible) continue;

    const unverifiedAccess = accessRoutes.some(
      (route, index) =>
        accessDistances[index] > 0.05 && (!route || route.isFallback)
    );
    return {
      ...transit,
      ...(unverifiedAccess
        ? {
            warning: [
              transit.warning,
              'No se pudo validar por OSRM el acceso peatonal a uno de los paraderos.',
            ]
              .filter(Boolean)
              .join(' '),
          }
        : {}),
    };
  }
  return null;
}
