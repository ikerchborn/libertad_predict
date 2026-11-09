/** Shared transport-catalog and normalized itinerary contracts. */

/** Confidence labels attached to transit data sources. */
type CatalogVehicleType = 'bus' | 'combi' | 'colectivo' | 'mototaxi';

/** Relative confidence assigned to a route or source review. */
export type CatalogConfidence = 'alta' | 'media' | 'baja';

/** Stop record in the regional transport catalog. */
export interface CatalogStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  landmark_hint?: string;
  street?: string;
  urbanization?: string;
  sector?: string;
}

/** Fixed regional route and its optional directional geometries. */
export interface CatalogRoute {
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

/** Bundled regional transport data, including route plans assembled from multiple legs. */
export interface TransportCatalog {
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

/** Direction label used to associate Truxdi stops with route geometry. */
export type TruxdiDirection = 'ida' | 'vuelta';

/** Stop record aligned to a position on one direction of a Truxdi route. */
export interface TruxdiStop {
  name: string;
  coordinates: [number, number];
  direction: TruxdiDirection | null;
  position: number;
  geometry_position?: number;
  geometry_distance_m?: number;
  landmark_hint?: string;
  street?: string;
  address?: string;
  urbanization?: string;
  sector?: string;
}

/** Normalized Truxdi route, with separate directional geometries and stop inventories. */
export interface TruxdiRoute {
  route_id: string;
  route_name?: string | null;
  route_code?: string | null;
  source_route_code?: string | null;
  company_name?: string | null;
  vehicle_type?: 'micro' | 'combi' | null;
  estimated_minutes?: number | null;
  badge_color?: string | null;
  text_color?: string | null;
  vehicle_image_url?: string | null;
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

/**
 * Normalized transit, taxi, or walking option consumed by itinerary and map components.
 */
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
  vehicleImageUrl?: string;
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
