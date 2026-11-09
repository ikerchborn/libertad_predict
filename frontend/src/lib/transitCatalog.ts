/** Normalizes catalog labels, zones, stop landmarks, and fixed-route lookups. */
/** Normalizes catalog labels, zones, stop landmarks, and fixed-route lookups. */
import type { Place } from '@/lib/types';
import { haversineKm } from '@/lib/routeOptimizer';
import type { CatalogRoute, CatalogStop, TransitOption, TruxdiStop } from '@/lib/transitTypes';
import {
  getBadgeColor,
  getCatalogRoutePlan,
  getCatalogRouteRecord,
  getCatalogStop,
  getCatalogStops,
  getRouteColor,
  TEXT_ON_DARK,
} from '@/lib/transitCatalogData';

function getRouteGeometry(
  route: CatalogRoute,
  reverse: boolean
): [number, number][] | undefined {
  const coordinates = reverse
    ? route.geometry_vuelta?.geometry?.coordinates
    : route.geometry_ida?.geometry?.coordinates ??
      route.routeGeometry?.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return undefined;
  return coordinates.map(([lon, lat]) => [lat, lon] as [number, number]);
}

/** Removes source annotations and editorial notes before labels are shown to travelers. */
export function cleanTransitCopy(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s*\(referencial\)/gi, '')
    .replace(/\s*;\s*(?:referencia aproximada|punto referencial|sin referencia física publicada|confirma\b).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || undefined;
}

function isInventoryStopName(value: string): boolean {
  return (
    /(?:^|\s)(?:punto|nodo|pt)\s*\d+\s*$/i.test(value.trim()) ||
    /^(?:OSM[-\s]*\d+|[A-Z]{1,8}[- ]?\d+[A-Z0-9-]*)$/i.test(value.trim())
  );
}

/**
 * Replaces inventory-only stop labels with a readable physical reference.
 *
 * @returns A sanitized stop name, or a generic suggestion when no safe fallback exists.
 */
export function sanitizeStopName(
  stopName: string,
  coordinates: [number, number],
  fallbackZone?: string
): string {
  if (!isInventoryStopName(stopName)) {
    return cleanTransitCopy(stopName) ?? 'Paradero sugerido';
  }
  if (!coordinates.every(Number.isFinite)) return 'Paradero sugerido';
  const fallback = cleanTransitCopy(fallbackZone);
  return fallback && !isInventoryStopName(fallback)
    ? fallback
    : 'Paradero sugerido';
}

/** Replaces generated inventory names with the nearest readable stop-area reference. */
export function findNearbyReadableStopName(
  stops: TruxdiStop[],
  targetStop: TruxdiStop
): string | undefined {
  return stops
    .filter((stop) => !isInventoryStopName(stop.name))
    .map((stop) => ({
      stop,
      distanceKm: haversineKm(
        targetStop.coordinates[1],
        targetStop.coordinates[0],
        stop.coordinates[1],
        stop.coordinates[0]
      ),
    }))
    .filter(({ distanceKm }) => distanceKm <= 0.75)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .map(({ stop }) =>
      cleanTransitCopy(
        stop.street ??
          stop.address ??
          stop.urbanization ??
          stop.landmark_hint ??
          stop.name
      )
    )
    .find((name): name is string => Boolean(name));
}

function findNearbyReadableCatalogStopName(
  targetStop: CatalogStop
): string | undefined {
  return getCatalogStops()
    .filter((stop) => stop.id !== targetStop.id && !isInventoryStopName(stop.name))
    .map((stop) => ({
      stop,
      distanceKm: haversineKm(
        targetStop.latitude,
        targetStop.longitude,
        stop.latitude,
        stop.longitude
      ),
    }))
    .filter(({ distanceKm }) => distanceKm <= 0.75)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .map(({ stop }) =>
      cleanTransitCopy(
        stop.street ??
          stop.address ??
          stop.urbanization ??
          stop.sector ??
          stop.landmark_hint ??
          stop.name
      )
    )
    .find((name): name is string => Boolean(name));
}

/** Removes a repeated stop prefix from a landmark hint and drops duplicate labels. */
export function cleanLandmarkHint(stopName: string, hint?: string): string | undefined {
  const stop = cleanTransitCopy(stopName);
  let landmark = cleanTransitCopy(hint);
  if (!stop || !landmark) return undefined;
  if (landmark.toLowerCase().startsWith(stop.toLowerCase())) {
    landmark = landmark
      .slice(stop.length)
      .replace(/^[\s().·—:;,.–-]+|[\s().·—:;,.–-]+$/g, '')
      .trim();
  }
  return landmark && landmark.toLowerCase() !== stop.toLowerCase()
    ? landmark
    : undefined;
}

/** Assigns a place to the regional zone used by the fixed-route catalog. */
export function getZone(place: Place): string {
  const name = place.name.toLowerCase();
  const address = (place.address || '').toLowerCase();
  const text = `${name} ${address}`;

  if (
    text.includes('chan chan') ||
    text.includes('nik an') ||
    (place.lat > -8.115 && place.lat < -8.10 && place.lon < -79.065)
  ) return 'chan_chan';
  if (
    text.includes('huanchaco') ||
    (place.lat > -8.10 && place.lat < -8.02 && place.lon < -79.11)
  ) return 'huanchaco';
  if (text.includes('moche') || text.includes('sol y luna') || text.includes('ai apaec') || place.lat < -8.13) return 'moche';
  if (text.includes('brujo') || text.includes('magdalena de cao') || text.includes('señora de cao')) return 'el_brujo';
  if (text.includes('chocope') || (place.lat > -7.85 && place.lat < -7.74 && place.lon < -79.18)) return 'chocope';
  if (text.includes('pacasmayo') || (place.lat > -7.55 && place.lat < -7.25)) return 'pacasmayo';
  if (text.includes('chicama') || text.includes('malabrigo') || (place.lat > -7.8 && place.lon < -79.28)) return 'chicama';
  if (text.includes('salaverry') || (place.lat < -8.18 && place.lon > -79.1)) return 'salaverry';
  if (text.includes('huamachuco') || text.includes('marcahuamachuco') || place.lon > -78.2) return 'huamachuco';
  return 'centro';
}

function reverseRoute(route: CatalogRoute, reverse: boolean): TransitOption {
  const boarding = getCatalogStop(reverse ? route.dropoffStopId : route.boardingStopId);
  const dropoff = getCatalogStop(reverse ? route.boardingStopId : route.dropoffStopId);
  if (!boarding || !dropoff) {
    throw new Error(`El catálogo de transporte no tiene paraderos para ${route.id}`);
  }
  const routeGeometry = getRouteGeometry(route, reverse);
  const boardingStop = getCatalogStop(reverse ? route.dropoffStopId : route.boardingStopId);
  const dropoffStop = getCatalogStop(reverse ? route.boardingStopId : route.dropoffStopId);
  const routeGeometryVerified = reverse
    ? route.geometry_vuelta_verified === true && Boolean(route.geometry_vuelta)
    : (route.geometry_ida_verified ?? route.geometryVerified) === true &&
      Boolean(route.geometry_ida ?? route.routeGeometry);
  const boardingStopName = sanitizeStopName(
    boarding.name,
    [boarding.longitude, boarding.latitude],
    boarding.street ??
      boarding.address ??
      boarding.urbanization ??
      boarding.sector ??
      findNearbyReadableCatalogStopName(boarding)
  );
  const dropoffStopName = sanitizeStopName(
    dropoff.name,
    [dropoff.longitude, dropoff.latitude],
    dropoff.street ??
      dropoff.address ??
      dropoff.urbanization ??
      dropoff.sector ??
      findNearbyReadableCatalogStopName(dropoff)
  );

  return {
    code: route.code,
    serviceName: route.serviceName,
    vehicleType: route.vehicleType,
    farePen: route.farePen,
    fareRangePen: route.fareRangePen,
    estimatedMinutes: route.estimatedMinutes,
    waitMinutes:
      route.headwayMinutes ??
      (route.category === 'urbano' ? 6 : route.category === 'local' ? 8 : 15),
    boardingStop: boardingStopName,
    dropoffStop: dropoffStopName,
    boardingPoint: [boarding.latitude, boarding.longitude],
    dropoffPoint: [dropoff.latitude, dropoff.longitude],
    instructions: `Ruta ${reverse ? 'de retorno' : 'de salida'} desde ${boardingStopName}.`,
    confidence: route.confidence,
    source: route.source,
    routeGeometry,
    routeGeometryVerified: routeGeometryVerified && Boolean(routeGeometry),
    routeColor: getBadgeColor(route),
    routeCode: route.route_code ?? route.code,
    companyName: route.company_name ?? route.serviceName,
    badgeColor: getBadgeColor(route),
    textColor: route.text_color ?? TEXT_ON_DARK,
    boardingLandmarkHint: cleanLandmarkHint(
      boardingStopName,
      boardingStop?.landmark_hint ?? boardingStop?.address
    ),
    dropoffLandmarkHint: cleanLandmarkHint(
      dropoffStopName,
      dropoffStop?.landmark_hint ?? dropoffStop?.address
    ),
  };
}

/**
 * Resolves a catalog-supported route between two normalized zones.
 *
 * Returns `null` when the zone pair has no configured direct or multi-leg plan.
 */
export function getCatalogRoute(
  fromZone: string,
  toZone: string
): TransitOption | null {
  const directRoutes: Array<[string, string, string]> = [
    ['chicama', 'trujillo', 'trujillo-puerto-chicama'],
    ['chocope', 'trujillo', 'trujillo-chocope'],
    ['pacasmayo', 'trujillo', 'trujillo-pacasmayo'],
    ['salaverry', 'trujillo', 'trujillo-salaverry'],
    ['huanchaco', 'trujillo', 'trujillo-huanchaco'],
  ];
  const trujilloArea = new Set(['centro', 'huanchaco', 'chan_chan', 'moche', 'salaverry']);

  for (const [outsideZone, , routeId] of directRoutes) {
    if (
      (fromZone === outsideZone && trujilloArea.has(toZone)) ||
      (toZone === outsideZone && trujilloArea.has(fromZone))
    ) {
      const route = getCatalogRouteRecord(routeId);
      if (route) return reverseRoute(route, fromZone === outsideZone);
    }
  }

  if (
    (trujilloArea.has(fromZone) && toZone === 'el_brujo') ||
    (fromZone === 'el_brujo' && trujilloArea.has(toZone))
  ) {
    const legPlan = getCatalogRoutePlan('trujillo-el-brujo');
    if (!legPlan) return null;
    const legs = legPlan.legs.map((leg) => getCatalogRouteRecord(leg.routeId)).filter(Boolean) as CatalogRoute[];
    if (legs.length !== legPlan.legs.length) return null;
    const reverse = fromZone === 'el_brujo';
    const first = reverseRoute(legs[0], false);
    const last = reverseRoute(legs[legs.length - 1], false);
    const routeLegOptions = (reverse ? [...legs].reverse() : legs).map((leg) =>
      reverseRoute(leg, reverse)
    );
    return {
      ...first,
      code: 'RUTA-EL-BRUJO',
      serviceName: 'Bus + colectivo + mototaxi hacia El Brujo',
      vehicleType: 'bus',
      farePen: legPlan.totalFarePen,
      fareRangePen: [
        legs.reduce((total, leg) => total + leg.fareRangePen[0], 0),
        legs.reduce((total, leg) => total + leg.fareRangePen[1], 0),
      ],
      estimatedMinutes: legPlan.totalEstimatedMinutes,
      waitMinutes: routeLegOptions.reduce(
        (total, leg) => total + leg.waitMinutes,
        0
      ),
      boardingStop: reverse ? last.dropoffStop : first.boardingStop,
      dropoffStop: reverse ? first.boardingStop : last.dropoffStop,
      boardingPoint: reverse ? last.dropoffPoint : first.boardingPoint,
      dropoffPoint: reverse ? first.boardingPoint : last.dropoffPoint,
      instructions: 'Tramo oficial: Trujillo → Chocope → Magdalena de Cao → El Brujo. Debes hacer dos transbordos.',
      confidence: legPlan.confidence,
      source: legPlan.source,
      routeLegs: routeLegOptions.map((leg) => ({
        code: leg.code,
        serviceName: leg.serviceName,
        vehicleType: leg.vehicleType as 'bus' | 'colectivo' | 'mototaxi',
        farePen: leg.farePen,
        estimatedMinutes: leg.estimatedMinutes,
        waitMinutes: leg.waitMinutes,
        boardingStop: leg.boardingStop,
        dropoffStop: leg.dropoffStop,
        boardingPoint: leg.boardingPoint,
        dropoffPoint: leg.dropoffPoint,
        routeGeometry: leg.routeGeometry,
        routeGeometryVerified: leg.routeGeometryVerified,
        routeColor: leg.routeColor ?? getRouteColor(leg.code),
        routeCode: leg.routeCode,
        companyName: leg.companyName,
        badgeColor: leg.badgeColor,
        textColor: leg.textColor,
        boardingLandmarkHint: leg.boardingLandmarkHint,
        dropoffLandmarkHint: leg.dropoffLandmarkHint,
      })),
    };
  }

  if (
    (trujilloArea.has(fromZone) && toZone === 'huamachuco') ||
    (fromZone === 'huamachuco' && trujilloArea.has(toZone))
  ) {
    const route = getCatalogRouteRecord('trujillo-huamachuco');
    if (route) return reverseRoute(route, fromZone === 'huamachuco');
  }

  return null;
}
