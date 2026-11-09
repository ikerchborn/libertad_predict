import type { Place } from '@/lib/types';
import { haversineKm } from '@/lib/routeOptimizer';
import { fetchOsrmRoute, type OsrmRouteResult } from '@/lib/osrmService';
import transportCatalogJson from '@/data/transport_outside_trujillo.json';
import truxdiRouteData from '@/data/rutas_trujillo.json';

type CatalogVehicleType = 'bus' | 'combi' | 'colectivo' | 'mototaxi';
type CatalogConfidence = 'alta' | 'media' | 'baja';

interface CatalogStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  landmark_hint?: string;
}

interface CatalogRoute {
  id: string;
  code: string;
  serviceName: string;
  route_code?: string;
  company_name?: string;
  badge_color?: string;
  text_color?: string;
  vehicleType: CatalogVehicleType;
  category?: string;
  farePen: number;
  fareRangePen: [number, number];
  estimatedMinutes: number;
  distanceKm: number;
  boardingStopId: string;
  dropoffStopId: string;
  geometry_ida?: {
    geometry?: {
      coordinates?: [number, number][];
    };
  };
  geometry_vuelta?: {
    geometry?: {
      coordinates?: [number, number][];
    };
  };
  routeGeometry?: {
    geometry?: {
      coordinates?: [number, number][];
    };
  };
  geometryVerified?: boolean;
  geometry_ida_verified?: boolean;
  geometry_vuelta_verified?: boolean;
  headwayMinutes?: number;
  confidence: CatalogConfidence;
  source: string;
}

interface TransportCatalog {
  stops: CatalogStop[];
  routes: CatalogRoute[];
  routeLegs: Array<{
    id: string;
    totalEstimatedMinutes: number;
    totalFarePen: number;
    legs: Array<{ routeId: string }>;
    confidence: CatalogConfidence;
    source: string;
  }>;
}

type TruxdiDirection = 'ida' | 'vuelta';

interface TruxdiStop {
  name: string;
  coordinates: [number, number];
  direction: TruxdiDirection | null;
  position: number;
  geometry_position?: number;
  geometry_distance_m?: number;
  landmark_hint?: string;
}

interface TruxdiRoute {
  route_id: string;
  route_name?: string | null;
  route_code?: string | null;
  source_route_code?: string | null;
  company_name?: string | null;
  vehicle_type?: 'micro' | 'combi' | null;
  estimated_minutes?: number | null;
  badge_color?: string | null;
  text_color?: string | null;
  fare: { standard: number | null; currency: 'PEN' };
  geometry_ida: [number, number][];
  geometry_vuelta: [number, number][];
  geometry_ida_verified: boolean;
  geometry_vuelta_verified: boolean;
  stops: TruxdiStop[];
  direction_sources: Array<{
    direction: string;
    review_status: string;
    confidence: number | null;
  }>;
}

const transportCatalog = transportCatalogJson as unknown as TransportCatalog;
const catalogStops = new Map(transportCatalog.stops.map((stop) => [stop.id, stop]));
const catalogRoutes = new Map(transportCatalog.routes.map((route) => [route.id, route]));
const truxdiRoutes = (
  truxdiRouteData as unknown as { routes: TruxdiRoute[] }
).routes;
const truxdiGeometryDistanceCache = new Map<string, number>();
const truxdiCandidatesCache = new Map<
  string,
  Array<{ transit: TransitOption; totalEstimatedMinutes: number }>
>();

export interface TransitOption {
  code: string;
  serviceName: string;
  headsign?: string;
  vehicleType: 'micro' | 'combi' | 'bus' | 'colectivo' | 'mototaxi' | 'caminata' | 'taxi';
  farePen: number;
  estimatedMinutes: number;
  waitMinutes: number;
  boardingStop: string;
  dropoffStop: string;
  boardingPoint: [number, number];
  dropoffPoint: [number, number];
  instructions: string;
  fareRangePen?: [number, number];
  confidence?: CatalogConfidence;
  source?: string;
  routeGeometry?: [number, number][];
  routeGeometryVerified?: boolean;
  routeDistanceKm?: number;
  warning?: string;
  routeColor?: string;
  routeCode?: string;
  companyName?: string;
  badgeColor?: string;
  textColor?: string;
  boardingLandmarkHint?: string;
  dropoffLandmarkHint?: string;
  routeLegs?: Array<{
    code: string;
    serviceName: string;
    vehicleType: 'bus' | 'colectivo' | 'mototaxi';
    farePen: number;
    estimatedMinutes: number;
    waitMinutes: number;
    boardingStop: string;
    dropoffStop: string;
    boardingPoint: [number, number];
    dropoffPoint: [number, number];
    routeGeometry?: [number, number][];
    routeGeometryVerified?: boolean;
    routeColor: string;
    routeCode?: string;
    companyName?: string;
    badgeColor?: string;
    textColor?: string;
    boardingLandmarkHint?: string;
    dropoffLandmarkHint?: string;
  }>;
}

const CHICAMA_FARE = 12.0;
const EL_BRUJO_FARE = 10.0;
const HUAMACHUCO_FARE = 30.0;

const TRANSIT_STOPS = {
  mansiche: [-8.1028, -79.0448] as [number, number],
  huanchaco: [-8.0786, -79.1214] as [number, number],
  chanChan: [-8.1099, -79.0745] as [number, number],
  museoChanChan: [-8.1000, -79.0657] as [number, number],
  grau: [-8.1267, -78.9954] as [number, number],
  moche: [-8.1336, -78.9909] as [number, number],
  chicama: [-7.6944, -79.4389] as [number, number],
  santaCruz: [-8.1018, -79.0286] as [number, number],
  brujo: [-7.9158, -79.3039] as [number, number],
  huamachuco: [-7.8152, -78.0501] as [number, number],
} as const;

const ROUTE_COLORS = [
  '#C2410C',
  '#0369A1',
  '#7E22CE',
  '#047857',
  '#BE123C',
  '#A16207',
];
const TEXT_ON_DARK = '#FFFFFF';
const walkingRouteCache = new Map<string, Promise<OsrmRouteResult | null>>();

function getRouteColor(code: string): string {
  const hash = [...code].reduce((value, character) => value + character.charCodeAt(0), 0);
  return ROUTE_COLORS[hash % ROUTE_COLORS.length];
}

function getCatalogStop(id: string): CatalogStop | undefined {
  return catalogStops.get(id);
}

function getBadgeColor(route: Pick<CatalogRoute, 'badge_color' | 'code'>): string {
  return route.badge_color ?? getRouteColor(route.code);
}

function getWalkingRoute(
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

function getPolylineDistanceKm(coordinates: [number, number][]): number {
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
  destination: Place
): Array<{ transit: TransitOption; totalEstimatedMinutes: number }> {
  const cacheKey = `${origin.lat},${origin.lon}>${destination.lat},${destination.lon}`;
  const cachedCandidates = truxdiCandidatesCache.get(cacheKey);
  if (cachedCandidates) return cachedCandidates;

  const candidates: Array<{ transit: TransitOption; totalEstimatedMinutes: number }> = [];
  const maxStopAccessKm = 0.8;

  for (const route of truxdiRoutes) {
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
              boardingStop: boarding.stop.name,
              dropoffStop: alighting.stop.name,
              boardingPoint: [
                boarding.stop.coordinates[1],
                boarding.stop.coordinates[0],
              ],
              dropoffPoint: [
                alighting.stop.coordinates[1],
                alighting.stop.coordinates[0],
              ],
              instructions: `Camina hasta ${boarding.stop.name}, aborda ${route.company_name ?? routeCode} (${routeCode}) y desciende en ${alighting.stop.name}.`,
              confidence,
              source: `Truxdi · ${sourceDirection?.review_status ?? 'revision pendiente'}`,
              routeGeometry,
              routeGeometryVerified: geometryVerified,
              routeDistanceKm,
              routeColor: badgeColor,
              routeCode,
              companyName: route.company_name ?? route.route_name ?? routeCode,
              badgeColor,
              textColor: route.text_color ?? TEXT_ON_DARK,
              boardingLandmarkHint:
                boarding.stop.landmark_hint ??
                'Sin referencia física publicada; confirma el punto exacto con la empresa.',
              dropoffLandmarkHint:
                alighting.stop.landmark_hint ??
                'Sin referencia física publicada; confirma el punto exacto con la empresa.',
              warning: geometryVerified
                ? undefined
                : 'Recorrido referencial: confirma la ruta y los paraderos con la empresa antes de abordar.',
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

function getZone(place: Place): string {
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
  const boarding = catalogStops.get(reverse ? route.dropoffStopId : route.boardingStopId);
  const dropoff = catalogStops.get(reverse ? route.boardingStopId : route.dropoffStopId);
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
    boardingStop: boarding.name,
    dropoffStop: dropoff.name,
    boardingPoint: [boarding.latitude, boarding.longitude],
    dropoffPoint: [dropoff.latitude, dropoff.longitude],
    instructions: `Ruta ${reverse ? 'de retorno' : 'de salida'} desde ${boarding.name}. Tarifa referencial; confirmar en el terminal.`,
    confidence: route.confidence,
    source: route.source,
    routeGeometry,
    routeGeometryVerified: routeGeometryVerified && Boolean(routeGeometry),
    routeColor: getBadgeColor(route),
    routeCode: route.route_code ?? route.code,
    companyName: route.company_name ?? route.serviceName,
    badgeColor: getBadgeColor(route),
    textColor: route.text_color ?? TEXT_ON_DARK,
    boardingLandmarkHint: boardingStop?.landmark_hint ??
      `${boarding.name}${boardingStop?.address ? ` · ${boardingStop.address}` : ''}; referencia aproximada, confirma el punto de abordaje.`,
    dropoffLandmarkHint: dropoffStop?.landmark_hint ??
      `${dropoff.name}${dropoffStop?.address ? ` · ${dropoffStop.address}` : ''}; confirma el punto de descenso.`,
  };
}

function getCatalogRoute(
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
      const route = catalogRoutes.get(routeId);
      if (route) return reverseRoute(route, fromZone === outsideZone);
    }
  }

  if (
    (trujilloArea.has(fromZone) && toZone === 'el_brujo') ||
    (fromZone === 'el_brujo' && trujilloArea.has(toZone))
  ) {
    const legPlan = transportCatalog.routeLegs.find((plan) => plan.id === 'trujillo-el-brujo');
    if (!legPlan) return null;
    const legs = legPlan.legs.map((leg) => catalogRoutes.get(leg.routeId)).filter(Boolean) as CatalogRoute[];
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
    const route = catalogRoutes.get('trujillo-huamachuco');
    if (route) return reverseRoute(route, fromZone === 'huamachuco');
  }

  return null;
}

/**
 * Resolves available public-transit references and marks unsupported city pairs as unverified.
 */
export function calculateTaxiEstimate(distKm: number): {
  fareMin: number;
  fareMax: number;
  fareAvg: number;
  estimatedMinutes: number;
} {
  let fareMin: number;
  let fareMax: number;
  if (distKm <= 2.5) {
    fareMin = 6.0;
    fareMax = 8.0;
  } else if (distKm <= 5.0) {
    fareMin = 8.0;
    fareMax = 12.0;
  } else if (distKm <= 9.0) {
    fareMin = Math.round(12.0 + (distKm - 5.0) * 1.8);
    fareMax = Math.round(16.0 + (distKm - 5.0) * 2.2);
  } else if (distKm <= 16.0) {
    fareMin = Math.round(19.0 + (distKm - 9.0) * 1.6);
    fareMax = Math.round(26.0 + (distKm - 9.0) * 2.0);
  } else {
    fareMin = Math.round(32.0 + (distKm - 16.0) * 1.5);
    fareMax = Math.round(42.0 + (distKm - 16.0) * 1.9);
  }
  const fareAvg = Math.round(((fareMin + fareMax) / 2) * 10) / 10;
  const estimatedMinutes = Math.max(5, Math.round((distKm / 28) * 60));
  return { fareMin, fareMax, fareAvg, estimatedMinutes };
}

function getTransitBetweenPlacesBase(
  origin: Place,
  destination: Place,
  urbanFare = 2.5,
  includeTruxdi = true
): TransitOption {
  const dist = haversineKm(origin.lat, origin.lon, destination.lat, destination.lon);
  const fromZone = getZone(origin);
  const toZone = getZone(destination);

  if (dist <= 0.3) {
    return {
      code: 'WALK',
      serviceName: 'Caminata Peatonal',
      vehicleType: 'caminata',
      farePen: 0,
      estimatedMinutes: Math.max(5, Math.round((dist / 4.5) * 60)),
      waitMinutes: 0,
      boardingStop: origin.name,
      dropoffStop: destination.name,
      boardingPoint: [origin.lat, origin.lon],
      dropoffPoint: [destination.lat, destination.lon],
      instructions: `Trayecto corto de ${Math.round(dist * 1000)} m en línea directa. La distancia real a pie puede ser mayor; sigue las calles peatonales.`,
    };
  }

  if (includeTruxdi) {
    const truxdiOption = getTruxdiTransitCandidates(origin, destination).find(
      ({ transit }) =>
        haversineKm(
          origin.lat,
          origin.lon,
          transit.boardingPoint[0],
          transit.boardingPoint[1]
        ) <= 0.3 &&
        haversineKm(
          transit.dropoffPoint[0],
          transit.dropoffPoint[1],
          destination.lat,
          destination.lon
        ) <= 0.3
    )?.transit;
    if (truxdiOption) return truxdiOption;
  }

  const catalogOption = getCatalogRoute(fromZone, toZone);
  if (catalogOption) return catalogOption;

  // Chan Chan <-> Museo de Sitio Chan Chan (dentro del mismo complejo arqueológico)
  if (
    (origin.id === 3 && destination.id === 415) ||
    (origin.id === 415 && destination.id === 3) ||
    (fromZone === 'chan_chan' && toZone === 'chan_chan' && dist < 3.0)
  ) {
    return {
      code: 'TAXI-LOCAL',
      routeColor: getRouteColor('TAXI-LOCAL'),
      serviceName: 'Taxi local / Mototaxi o Caminata',
      vehicleType: 'taxi',
      farePen: 5.0,
      fareRangePen: [4.0, 7.0],
      estimatedMinutes: 5,
      waitMinutes: 0,
      boardingStop: `Frontis de ${origin.name}`,
      dropoffStop: `Puerta de ingreso a ${destination.name}`,
      boardingPoint: [origin.lat, origin.lon],
      dropoffPoint: [destination.lat, destination.lon],
      instructions: `Recorrido de ${dist.toFixed(1)} km dentro del complejo arqueológico. Puedes caminar (~15 min) o tomar taxi/mototaxi local por S/ 4.00 – 7.00 (~5 min).`,
      confidence: 'alta',
      source: 'Circuito arqueológico Chan Chan',
    };
  }

  // Trujillo Centro <-> Huanchaco
  if ((fromZone === 'centro' && toZone === 'huanchaco') || (fromZone === 'huanchaco' && toZone === 'centro')) {
    return {
      code: 'M-06 B',
      routeColor: getRouteColor('M-06 B'),
      serviceName: 'Microbús Línea B ("La B de Huanchaco")',
      headsign: 'Huanchaco (referencial)',
      vehicleType: 'micro',
      farePen: urbanFare,
      estimatedMinutes: 30,
      waitMinutes: 6,
      boardingStop: fromZone === 'centro' ? 'Av. Mansiche / Óvalo Mansiche' : 'Av. Víctor Larco / Malecón Huanchaco',
      dropoffStop: toZone === 'huanchaco' ? 'Playa Huanchaco / Malecón' : 'Av. España / Centro Histórico',
      boardingPoint: fromZone === 'centro' ? TRANSIT_STOPS.mansiche : TRANSIT_STOPS.huanchaco,
      dropoffPoint: toZone === 'huanchaco' ? TRANSIT_STOPS.huanchaco : TRANSIT_STOPS.mansiche,
      instructions: 'Abordar el tradicional micro amarillo "Línea B" en Av. Mansiche. Frecuencia continua cada 6 minutos.',
    };
  }

  // Trujillo Centro <-> Chan Chan
  if ((fromZone === 'centro' && toZone === 'chan_chan') || (fromZone === 'chan_chan' && toZone === 'centro')) {
    return {
      code: 'M-04 A',
      routeColor: getRouteColor('M-04 A'),
      serviceName: 'Microbús Línea A / B de Huanchaco',
      headsign: 'Huanchaco (referencial)',
      vehicleType: 'micro',
      farePen: urbanFare,
      estimatedMinutes: 20,
      waitMinutes: 6,
      boardingStop: fromZone === 'centro' ? 'Av. Mansiche / Óvalo Papal' : 'Carretera a Huanchaco (Frontis Chan Chan)',
      dropoffStop: toZone === 'chan_chan' ? 'Ingreso a Chan Chan (Museo de Sitio)' : 'Av. Mansiche / Centro',
      boardingPoint: fromZone === 'centro' ? TRANSIT_STOPS.mansiche : TRANSIT_STOPS.museoChanChan,
      dropoffPoint: toZone === 'chan_chan' ? TRANSIT_STOPS.museoChanChan : TRANSIT_STOPS.mansiche,
      instructions: 'Tomar micro con dirección a Huanchaco y solicitar bajar en el paradero del Templo Nik An / Museo de Sitio.',
    };
  }

  // Chan Chan <-> Huanchaco
  if ((fromZone === 'chan_chan' && toZone === 'huanchaco') || (fromZone === 'huanchaco' && toZone === 'chan_chan')) {
    return {
      code: 'C-27 B',
      routeColor: getRouteColor('C-27 B'),
      serviceName: 'Combi Línea B ("Caballito de Totora")',
      vehicleType: 'combi',
      farePen: urbanFare,
      estimatedMinutes: 12,
      waitMinutes: 6,
      boardingStop: 'Carretera Huanchaco',
      dropoffStop: 'Balneario de Huanchaco',
      boardingPoint: fromZone === 'chan_chan' ? TRANSIT_STOPS.chanChan : TRANSIT_STOPS.huanchaco,
      dropoffPoint: fromZone === 'chan_chan' ? TRANSIT_STOPS.huanchaco : TRANSIT_STOPS.chanChan,
      instructions: 'Trayecto corto directo por la carretera asfaltada hacia el balneario.',
    };
  }

  // Trujillo Centro <-> Huacas del Sol y de la Luna (Moche)
  if ((fromZone === 'centro' && toZone === 'moche') || (fromZone === 'moche' && toZone === 'centro')) {
    return {
      code: 'C-14 S',
      routeColor: getRouteColor('C-14 S'),
      serviceName: 'Combi Línea S ("La S de Sol y Luna")',
      vehicleType: 'combi',
      farePen: urbanFare,
      estimatedMinutes: 25,
      waitMinutes: 6,
      boardingStop: fromZone === 'centro' ? 'Óvalo Grau / Av. América Sur' : 'Frontis Huacas de Moche',
      dropoffStop: toZone === 'moche' ? 'Museo Huacas de Moche / Huaca de la Luna' : 'Óvalo Grau / Centro',
      boardingPoint: fromZone === 'centro' ? TRANSIT_STOPS.grau : TRANSIT_STOPS.moche,
      dropoffPoint: toZone === 'moche' ? TRANSIT_STOPS.moche : TRANSIT_STOPS.grau,
      instructions: 'Abordar la combi blanca y celeste con letrero "Campiña de Moche - Huacas". Te deja en la puerta del santuario.',
    };
  }

  // Trujillo <-> Puerto Chicama (Malabrigo)
  if (fromZone === 'chicama' || toZone === 'chicama') {
    return {
      code: 'INTER-CHICAMA',
      routeColor: getRouteColor('INTER-CHICAMA'),
      serviceName: 'Ómnibus Interprovincial Chicama Express',
      vehicleType: 'bus',
      farePen: CHICAMA_FARE,
      estimatedMinutes: 80,
      waitMinutes: 15,
      boardingStop: 'Terminal Santa Cruz / Óvalo El Chira (Trujillo)',
      dropoffStop: 'Plaza de Armas de Puerto Malabrigo',
      boardingPoint: fromZone === 'chicama' ? TRANSIT_STOPS.chicama : TRANSIT_STOPS.santaCruz,
      dropoffPoint: fromZone === 'chicama' ? TRANSIT_STOPS.santaCruz : TRANSIT_STOPS.chicama,
      instructions: 'Salidas cada 30 minutos por la Panamericana Norte hacia la caleta y la ola izquierda.',
    };
  }

    // Trujillo <-> El Brujo (Magdalena de Cao)
  if (fromZone === 'el_brujo' || toZone === 'el_brujo') {
    return {
      code: 'RUTA-CAO',
      routeColor: getRouteColor('RUTA-CAO'),
      serviceName: 'Transporte Interprovincial Chocope - Magdalena de Cao',
      vehicleType: 'bus',
      farePen: EL_BRUJO_FARE,
      estimatedMinutes: 65,
      waitMinutes: 15,
      boardingStop: 'Terminal Santa Cruz (Trujillo) o Paradero Chocope',
      dropoffStop: 'Complejo Arqueológico El Brujo / Museo Cao',
      boardingPoint: fromZone === 'el_brujo' ? TRANSIT_STOPS.brujo : TRANSIT_STOPS.santaCruz,
      dropoffPoint: fromZone === 'el_brujo' ? TRANSIT_STOPS.santaCruz : TRANSIT_STOPS.brujo,
      instructions: 'Ruta por la Panamericana Norte hacia Chocope y conexión directa a Magdalena de Cao (aprox. 1h 10min).',
    };
  }

  // Trujillo <-> Marcahuamachuco (Huamachuco)
  if (fromZone === 'huamachuco' || toZone === 'huamachuco') {
    return {
      code: 'ANDINO-HUAMACHUCO',
      routeColor: getRouteColor('ANDINO-HUAMACHUCO'),
      serviceName: 'Bus Interandino Negreiros / Los Andes',
      vehicleType: 'bus',
      farePen: HUAMACHUCO_FARE,
      estimatedMinutes: 240,
      waitMinutes: 15,
      boardingStop: 'Terminal Terrestre El Chira / Prol. Vallejo',
      dropoffStop: 'Terminal Terrestre de Huamachuco (3,200 msnm)',
      boardingPoint: fromZone === 'huamachuco' ? TRANSIT_STOPS.huamachuco : TRANSIT_STOPS.santaCruz,
      dropoffPoint: fromZone === 'huamachuco' ? TRANSIT_STOPS.santaCruz : TRANSIT_STOPS.huamachuco,
      instructions: 'Viaje de montaña por la sierra de La Libertad. Recomendado salir a primera hora (05:00 - 06:00 AM).',
    };
  }

  // Sin línea directa de transporte público verificada: se recomienda Taxi / Aplicativo con tarifa calculada
  const taxi = calculateTaxiEstimate(dist);
  return {
    code: 'TAXI',
    routeColor: getRouteColor('TAXI'),
    serviceName: 'Taxi directo / Aplicativo (Yango, Uber, inDrive)',
    headsign: destination.name,
    vehicleType: 'taxi',
    farePen: taxi.fareAvg,
    fareRangePen: [taxi.fareMin, taxi.fareMax],
    estimatedMinutes: taxi.estimatedMinutes,
    waitMinutes: 0,
    boardingStop: `Punto de partida (${origin.name})`,
    dropoffStop: `Destino directo (${destination.name})`,
    boardingPoint: [origin.lat, origin.lon],
    dropoffPoint: [destination.lat, destination.lon],
    instructions: `Sin combi o micro directo para este trayecto. Te recomendamos tomar Taxi o aplicativo (Yango, Uber, inDrive). Tarifa estimada en Trujillo: S/ ${taxi.fareMin.toFixed(2)} – S/ ${taxi.fareMax.toFixed(2)} (~${taxi.estimatedMinutes} min).`,
    confidence: 'media',
    source: 'Tarifario referencial de taxis en Trujillo',
  };
}

function getTransitIdentity(code: string): {
  routeCode: string;
  companyName: string;
  badgeColor: string;
} {
  const identities: Record<string, { routeCode: string; companyName: string; badgeColor: string }> = {
    'M-06 B': { routeCode: 'B', companyName: 'Línea B (referencial)', badgeColor: '#1D4ED8' },
    'M-04 A': { routeCode: 'A/B', companyName: 'Línea A / B de Huanchaco (referencial)', badgeColor: '#0369A1' },
    'C-27 B': { routeCode: 'C-27', companyName: 'Combi Línea B (referencial)', badgeColor: '#047857' },
    'C-14 S': { routeCode: 'S', companyName: 'Combi Línea S (referencial)', badgeColor: '#7E22CE' },
    'TAXI-LOCAL': { routeCode: 'TAXI', companyName: 'Taxi local (referencial)', badgeColor: '#A16207' },
    TAXI: { routeCode: 'TAXI', companyName: 'Taxi / aplicativo (referencial)', badgeColor: '#A16207' },
    'RUTA-CAO': { routeCode: 'CAO', companyName: 'Transporte hacia El Brujo (referencial)', badgeColor: '#854D0E' },
    'INTER-CHICAMA': { routeCode: 'IC', companyName: 'Chicama Express (referencial)', badgeColor: '#854D0E' },
    'ANDINO-HUAMACHUCO': { routeCode: 'AH', companyName: 'Bus interandino (referencial)', badgeColor: '#0369A1' },
    'RUTA-EL-BRUJO': { routeCode: 'EL BRUJO', companyName: 'Conexión a El Brujo (referencial)', badgeColor: '#047857' },
  };
  return identities[code] ?? {
    routeCode: code,
    companyName: code,
    badgeColor: getRouteColor(code),
  };
}

function getLandmarkHint(stopName: string, address?: string): string {
  const stop = [...catalogStops.values()].find((candidate) => candidate.name === stopName);
  if (stop?.landmark_hint) return stop.landmark_hint;
  const reference = address ?? stop?.address;
  return `${stopName}${reference ? ` (${reference})` : ''}; referencia aproximada, confirma el punto autorizado para abordar o descender.`;
}

function enrichTransitOption(transit: TransitOption): TransitOption {
  const identity = getTransitIdentity(transit.code);
  return {
    ...transit,
    routeCode: transit.routeCode ?? identity.routeCode,
    companyName: transit.companyName ?? identity.companyName,
    badgeColor: transit.badgeColor ?? identity.badgeColor,
    textColor: transit.textColor ?? TEXT_ON_DARK,
    routeColor: transit.routeColor ?? transit.badgeColor ?? identity.badgeColor,
    boardingLandmarkHint:
      transit.boardingLandmarkHint ?? getLandmarkHint(transit.boardingStop),
    dropoffLandmarkHint:
      transit.dropoffLandmarkHint ?? getLandmarkHint(transit.dropoffStop),
    routeLegs: transit.routeLegs?.map((leg) => {
      const legIdentity = getTransitIdentity(leg.code);
      return {
        ...leg,
        routeCode: leg.routeCode ?? legIdentity.routeCode,
        companyName: leg.companyName ?? legIdentity.companyName,
        badgeColor: leg.badgeColor ?? legIdentity.badgeColor,
        textColor: leg.textColor ?? TEXT_ON_DARK,
        routeColor: leg.routeColor ?? leg.badgeColor ?? legIdentity.badgeColor,
        boardingLandmarkHint:
          leg.boardingLandmarkHint ?? getLandmarkHint(leg.boardingStop),
        dropoffLandmarkHint:
          leg.dropoffLandmarkHint ?? getLandmarkHint(leg.dropoffStop),
      };
    }),
  };
}

export function getTransitBetweenPlaces(
  origin: Place,
  destination: Place,
  urbanFare = 2.5
): TransitOption {
  return enrichTransitOption(
    getTransitBetweenPlacesBase(origin, destination, urbanFare)
  );
}

function getTransitFallbackWithoutTruxdi(
  origin: Place,
  destination: Place,
  urbanFare: number
): TransitOption {
  return enrichTransitOption(
    getTransitBetweenPlacesBase(origin, destination, urbanFare, false)
  );
}

async function resolveTruxdiTransit(
  origin: Place,
  destination: Place
): Promise<TransitOption | null> {
  const candidates = getTruxdiTransitCandidates(origin, destination);
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
      accessDistances[0] > 0.3
        ? getWalkingRoute([origin.lat, origin.lon], transit.boardingPoint)
        : Promise.resolve(null),
      accessDistances[1] > 0.3
        ? getWalkingRoute(transit.dropoffPoint, [destination.lat, destination.lon])
        : Promise.resolve(null),
    ]);
    const inaccessible = accessRoutes.some(
      (route) =>
        route &&
        !route.isFallback &&
        (route.distanceKm > 0.9 || route.durationMin > 12)
    );
    if (inaccessible) continue;

    const unverifiedAccess = accessRoutes.some(
      (route, index) =>
        accessDistances[index] > 0.3 && (!route || route.isFallback)
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

export async function resolveTransitBetweenPlaces(
  origin: Place,
  destination: Place,
  urbanFare = 2.5
): Promise<TransitOption> {
  const directDistanceKm = haversineKm(
    origin.lat,
    origin.lon,
    destination.lat,
    destination.lon
  );
  if (directDistanceKm < 0.3) {
    return getTransitBetweenPlaces(origin, destination, urbanFare);
  }
  if (directDistanceKm > 0.8) {
    const truxdiTransit = await resolveTruxdiTransit(origin, destination);
    return truxdiTransit ?? getTransitFallbackWithoutTruxdi(origin, destination, urbanFare);
  }

  const walkingRoute = await getWalkingRoute(
    [origin.lat, origin.lon],
    [destination.lat, destination.lon]
  );
  if (
    walkingRoute &&
    !walkingRoute.isFallback &&
    walkingRoute.distanceKm <= 0.9 &&
    walkingRoute.durationMin <= 12
  ) {
    return {
      code: 'WALK',
      serviceName: 'Caminata Peatonal',
      vehicleType: 'caminata',
      farePen: 0,
      estimatedMinutes: Math.max(1, walkingRoute.durationMin),
      waitMinutes: 0,
      boardingStop: origin.name,
      dropoffStop: destination.name,
      boardingPoint: [origin.lat, origin.lon],
      dropoffPoint: [destination.lat, destination.lon],
      routeGeometry: walkingRoute.coordinates,
      routeDistanceKm: walkingRoute.distanceKm,
      routeGeometryVerified: true,
      instructions: `Ruta peatonal por calles: ${walkingRoute.distanceKm.toFixed(1)} km, aproximadamente ${walkingRoute.durationMin} min.`,
    };
  }

  const truxdiTransit = await resolveTruxdiTransit(origin, destination);
  const transit =
    truxdiTransit ?? getTransitFallbackWithoutTruxdi(origin, destination, urbanFare);
  const reason = !walkingRoute || walkingRoute.isFallback
    ? 'No se pudo confirmar una ruta peatonal por calles;'
    : `La ruta peatonal mide ${walkingRoute.distanceKm.toFixed(1)} km y toma unos ${walkingRoute.durationMin} min;`;
  return {
    ...transit,
    warning: [
      transit.warning,
      `${reason} considera transporte o confirma el cruce peatonal antes de salir.`,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

export function getTransitAlternatives(
  origin: Place,
  destination: Place,
  transit: TransitOption
): Array<{ id: 'transit' | 'direct-taxi'; label: string; transit: TransitOption }> {
  if (!transit.routeLegs || transit.routeLegs.length < 2) {
    return [{ id: 'transit', label: 'Ruta disponible', transit }];
  }

  const taxi = calculateTaxiEstimate(
    haversineKm(origin.lat, origin.lon, destination.lat, destination.lon)
  );
  const directTaxi: TransitOption = {
    code: 'TAXI-DIRECTO',
    serviceName: 'Taxi directo / aplicativo',
    vehicleType: 'taxi',
    farePen: taxi.fareAvg,
    fareRangePen: [taxi.fareMin, taxi.fareMax],
    estimatedMinutes: taxi.estimatedMinutes,
    waitMinutes: 0,
    boardingStop: `Punto de partida (${origin.name})`,
    dropoffStop: `Destino (${destination.name})`,
    boardingPoint: [origin.lat, origin.lon],
    dropoffPoint: [destination.lat, destination.lon],
    routeColor: getRouteColor('TAXI-DIRECTO'),
    instructions: 'Opción directa en taxi estimada por distancia; no representa una ruta vial ni una tarifa confirmada.',
    confidence: 'baja',
    source: 'Estimación referencial por distancia en línea directa',
    warning: 'Tiempo y tarifa de taxi son referenciales; pueden variar por tráfico y negociación.',
  };

  return [
    { id: 'transit', label: 'Transporte público · con transbordos', transit },
    { id: 'direct-taxi', label: 'Directo · taxi estimado', transit: directTaxi },
  ];
}

export function estimateTransitCostMinutes(
  origin: Place,
  destination: Place,
  urbanFare = 2.5,
  transferPenaltyMinutes = 15,
  resolvedTransit?: TransitOption
): number {
  const transit = resolvedTransit ?? getTransitBetweenPlaces(origin, destination, urbanFare);
  if (transit.vehicleType === 'caminata') return transit.estimatedMinutes;

  const accessWalkKm = haversineKm(
    origin.lat,
    origin.lon,
    transit.boardingPoint[0],
    transit.boardingPoint[1]
  );
  const egressWalkKm = haversineKm(
    transit.dropoffPoint[0],
    transit.dropoffPoint[1],
    destination.lat,
    destination.lon
  );
  const routeLegs = transit.routeLegs ?? [];
  const transferWalkKm = routeLegs.slice(1).reduce((total, leg, index) => {
    const previousLeg = routeLegs[index];
    return total + haversineKm(
      previousLeg.dropoffPoint[0],
      previousLeg.dropoffPoint[1],
      leg.boardingPoint[0],
      leg.boardingPoint[1]
    );
  }, 0);
  const walkingMinutes = ((accessWalkKm + egressWalkKm + transferWalkKm) / 4.5) * 60;
  const transfers = Math.max(0, routeLegs.length - 1);

  const waitingMinutes = transit.routeLegs?.length
    ? transit.routeLegs.reduce((total, leg) => total + leg.waitMinutes, 0)
    : transit.waitMinutes;
  return walkingMinutes +
    transit.estimatedMinutes +
    waitingMinutes +
    transfers * transferPenaltyMinutes;
}
