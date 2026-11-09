/** Owns transport catalog loading, indexed lookups, fixed fares, and route styling constants. */
import transportCatalogJson from '@/data/transport_outside_trujillo.json';
import type { CatalogRoute, CatalogStop, TransportCatalog, TruxdiRoute } from '@/lib/transitTypes';

const transportCatalog = transportCatalogJson as unknown as TransportCatalog;
const catalogStops = new Map(transportCatalog.stops.map((stop) => [stop.id, stop]));
const catalogRoutes = new Map(transportCatalog.routes.map((route) => [route.id, route]));
let truxdiRoutesPromise: Promise<TruxdiRoute[]> | null = null;

/** One-way fare estimates used by fixed regional fallback routes. */
export const CHICAMA_FARE = 12.0;
/** One-way fare estimate for the El Brujo regional fallback. */
export const EL_BRUJO_FARE = 10.0;
/** One-way fare estimate for the Huamachuco regional fallback. */
export const HUAMACHUCO_FARE = 30.0;

/** Reference coordinates for fallback urban stops, in `[latitude, longitude]` order. */
export const TRANSIT_STOPS = {
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
/** Default text color for route badges with dark backgrounds. */
export const TEXT_ON_DARK = '#FFFFFF';

/** Produces a stable display color for a route code when the catalog has no brand color. */
export function getRouteColor(code: string): string {
  const hash = [...code].reduce((value, character) => value + character.charCodeAt(0), 0);
  return ROUTE_COLORS[hash % ROUTE_COLORS.length];
}

/** Looks up a stop by its stable catalog ID. */
export function getCatalogStop(id: string): CatalogStop | undefined {
  return catalogStops.get(id);
}

/** Lazily imports and memoizes the large Truxdi route dataset. */
export function loadTruxdiRoutes(): Promise<TruxdiRoute[]> {
  truxdiRoutesPromise ??= import('@/data/rutas_trujillo.json').then((module) => {
    const data = module.default as unknown as { routes: TruxdiRoute[] };
    return data.routes;
  });
  return truxdiRoutesPromise;
}

/** Uses the published badge color when present, otherwise derives one from its code. */
export function getBadgeColor(route: Pick<CatalogRoute, 'badge_color' | 'code'>): string {
  return route.badge_color ?? getRouteColor(route.code);
}

/** Looks up a fixed regional route by its stable catalog ID. */
export function getCatalogRouteRecord(id: string): CatalogRoute | undefined {
  return catalogRoutes.get(id);
}

/** Looks up a configured multi-leg route plan by its stable plan ID. */
export function getCatalogRoutePlan(id: string): TransportCatalog['routeLegs'][number] | undefined {
  return transportCatalog.routeLegs.find((plan) => plan.id === id);
}

/** Returns a snapshot of catalog stops for read-only normalization and label matching. */
export function getCatalogStops(): CatalogStop[] {
  return [...catalogStops.values()];
}
