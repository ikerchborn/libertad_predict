/** Shared frontend contracts for place catalog data, recommendations, reviews, and scores. */

/** Broad catalog category used by filters and API payloads. */
export type PlaceCategory = "attraction" | "hotel" | "restaurant";

/** UI-facing classification that distinguishes services beyond the broad catalog category. */
export type PlaceKind = "attraction" | "lodging" | "food" | "activity" | "unclassified";

/** Geographic context used to adapt recommendations and travel guidance. */
export type CoastType = "inland" | "coastal";

/**
 * Normalized place record shared by the API, catalog, map, and itinerary.
 *
 * API-owned core properties are required even when their value is unknown (`null`);
 * optional properties are enrichments supplied only by some data sources.
 */
export interface Place {
  id: number;
  osm_id: number;
  name: string;
  category: PlaceCategory;
  kind: PlaceKind;
  coast_type: CoastType;
  lat: number;
  lon: number;
  address: string | null;
  score: number | null;
  confidence: number | null;

  /** Convenience score from the recommendation pipeline, when available. */
  convenience_score?: number | null;
  /** Overall recommendation score, when available. */
  recommendation_score?: number | null;
  /** Human-readable explanation of the recommendation, when available. */
  recommendation_summary?: string | null;

  /** Public map, website, contact, and pricing references when present in the source. */
  maps_url?: string | null;
  website?: string | null;
  phone?: string | null;
  cuisine?: string | null;
  stars?: number | null;
  external_rating?: number | null;
  user_rating_count?: number | null;
  google_place_id?: string | null;
  price_level?: number | null;
  price_min?: number | null;
  price_max?: number | null;
  image_url?: string | null;
  local_image_path?: string | null;
  safety_score?: number | null;
  temp_max_c?: number | null;
  temp_min_c?: number | null;
  precipitation_mm?: number | null;
  rain_probability?: number | null;
  uv_index?: number | null;
  wave_height_m?: number | null;
  wave_period_s?: number | null;

  /** UI enrichment used to group or personalize place suggestions. */
  zone?: "costa" | "valle" | "sierra";
  profile?: "surfer" | "culture" | "family";
  /** Presentation enrichment; these fields are not required in the API record. */
  image?: string;
  description?: string;
  bestTime?: string;
  weatherText?: string;
  surfText?: string;
  crowdText?: string;
}

/** Commercial offer captured for a place; prices use the currency named by `currency`. */
export interface Offer {
  kind: string;
  name: string;
  price: number;
  currency: string;
  captured_at: string;
}

/** One weighted input and its human-readable contribution to a recommendation. */
export interface RecommendationFactor {
  name: string;
  score: number;
  weight: number;
  contribution: number;
  explanation: string;
}

/** A nearby candidate paired with its distance and recommendation explanation. */
export interface NearbyPlace {
  place: Place;
  distance_km: number;
  recommendation_score: number;
  summary: string;
  breakdown: RecommendationFactor[];
}

/** User review associated with a place, optionally including relative publication time. */
export interface PlaceReview {
  author_name: string;
  rating: number;
  text: string;
  relative_time?: string | null;
}

/** Aggregated count and share for one reported incident category. */
export interface CrimeIncidentSummary {
  name: string;
  count: number;
  percentage: number;
}

/** Place-specific safety assessment with incident totals, time-of-day context, and guidance. */
export interface PlaceSafetyReport {
  score: number;
  risk_level: string;
  incident_count: number;
  radius_meters: number;
  shifts: {
    mañana?: number;
    tarde?: number;
    noche?: number;
    madrugada?: number;
  };
  shift_percentages: {
    mañana?: number;
    tarde?: number;
    noche?: number;
    madrugada?: number;
  };
  critical_shift: string;
  unsafe_hours: string;
  safe_hours: string;
  unsafe_dates_notice: string;
  top_crimes: CrimeIncidentSummary[];
  recommendations: string[];
  source: string;
  evaluated_at: string;
}

/** Extended place payload returned by detail views; all additions are optional enrichments. */
export interface PlaceDetail extends Place {
  opening_hours?: string | null;
  menu_url?: string | null;
  reviews?: PlaceReview[];
  safety_report?: PlaceSafetyReport | null;
  source?: string;
  fetched_at?: string | null;
  offers?: Offer[];
  recommendation_breakdown?: RecommendationFactor[];
}

/** Provenance and weighted contribution for one factor in a computed score. */
export interface FactorBreakdown {
  name: string;
  value: number;
  weight: number;
  contribution: number;
  data_source: string;
  data_date: string;
  explanation: string;
}

/** Score and factor breakdown for one place on one calendar date. */
export interface CalendarDay {
  date: string;
  score: number;
  confidence: number;
  breakdown: FactorBreakdown[];
}

/** Date window and per-day scores returned by the calendar endpoint. */
export interface CalendarResponse {
  place_id: number;
  date_from: string;
  date_to: string;
  days: CalendarDay[];
}

/** Detailed score result including calculation time and the weights version used. */
export interface ScoreDetail {
  place_id: number;
  date: string;
  score: number;
  confidence: number;
  breakdown: FactorBreakdown[];
  computed_at: string;
  weights_version: string;
}

/** Visual tokens for one heatmap score band. */
export interface HeatmapClassification {
  level: number;
  name: string;
  rangeLabel: string;
  bgHex: string;
  textHex: string;
  borderHex: string;
  badgeClass: string;
}

/** Ordered score bands used by heatmap badges; ranges are inclusive as labeled. */
export const HEATMAP_STEPS: HeatmapClassification[] = [
  {
    level: 1,
    name: "Crítico",
    rangeLabel: "0 - 39",
    bgHex: "#FEE2E2",
    textHex: "#B91C1C",
    borderHex: "#FECACA",
    badgeClass: "badge-critico",
  },
  {
    level: 2,
    name: "Desfavorable",
    rangeLabel: "40 - 54",
    bgHex: "#FFEDD5",
    textHex: "#C2410C",
    borderHex: "#FED7AA",
    badgeClass: "badge-desfavorable",
  },
  {
    level: 3,
    name: "Regular",
    rangeLabel: "55 - 69",
    bgHex: "#FEF9C3",
    textHex: "#A16207",
    borderHex: "#FEF08A",
    badgeClass: "badge-regular",
  },
  {
    level: 4,
    name: "Favorable",
    rangeLabel: "70 - 84",
    bgHex: "#DCFCE7",
    textHex: "#15803D",
    borderHex: "#BBF7D0",
    badgeClass: "badge-favorable",
  },
  {
    level: 5,
    name: "Óptimo",
    rangeLabel: "85 - 100",
    bgHex: "#E0F2FE",
    textHex: "#0369A1",
    borderHex: "#BAE6FD",
    badgeClass: "badge-optimo",
  },
];

/** Curated presentation copy and image paths for selected featured place IDs. */
export const PLACE_IMAGES: Record<
  number,
  { image: string; description: string; bestTime: string }
> = {
  1: {
    image: "/images/places/place_1.webp",
    description: "Centro histórico colonial con arquitectura republicana, iglesias barrocas y la emblemática Plaza de Armas.",
    bestTime: "9:00 AM - 1:00 PM",
  },
  2: {
    image: "/images/places/place_2.webp",
    description: "Tradicional caleta de pescadores moche, surf de olas consistentes y paseos en caballitos de totora.",
    bestTime: "7:00 AM - 11:30 AM",
  },
  3: {
    image: "/images/places/place_3.webp",
    description: "La ciudad de barro más grande de América precolombina, capital del reino Chimú declarada Patrimonio de la Humanidad.",
    bestTime: "9:00 AM - 12:30 PM",
  },
  4: {
    image: "/images/places/place_4.webp",
    description: "Santuario mochica con policromías murales y altorrelieves ceremoniales dedicados a la deidad Ai Apaec.",
    bestTime: "8:30 AM - 12:00 PM",
  },
  5: {
    image: "/images/places/place_5.webp",
    description: "Sede de la ola izquierda más larga y perfecta del mundo, meca mundial del surf con brisas constantes.",
    bestTime: "6:30 AM - 10:30 AM",
  },
  6: {
    image: "/images/places/place_6.webp",
    description: "Impresionante fortaleza preínca en la cumbre andina de Huamachuco a más de 3,200 metros sobre el nivel del mar.",
    bestTime: "9:30 AM - 1:30 PM",
  },
  303: {
    image: "/images/places/place_303.webp",
    description: "Majestuoso palacio neoclásico del siglo XIX con imponentes columnas dóricas y patio republicano.",
    bestTime: "9:00 AM - 1:00 PM",
  },
  304: {
    image: "/images/places/place_304.webp",
    description: "Templo piramidal de la cultura Chimú con frisos ceremoniales que representan la fertilidad marina.",
    bestTime: "9:00 AM - 1:00 PM",
  },
  232: {
    image: "/images/places/place_232.webp",
    description: "Complejo arqueológico y Museo de Sitio en el valle Chicama donde descansan los restos de la Señora de Cao, gobernante moche.",
    bestTime: "9:00 AM - 1:30 PM",
  },
  420: {
    image: "/images/places/place_420.webp",
    description: "Espacio cultural al aire libre en la campiña de Moche con esculturas monumentales que representan la cosmovisión y cerámica mochica de la fertilidad.",
    bestTime: "9:30 AM - 3:00 PM",
  },
  305: {
    image: "/images/places/place_305.webp",
    description: "Primer museo del juguete de Latinoamérica fundado por el artista Gerardo Chávez.",
    bestTime: "10:00 AM - 4:00 PM",
  },
};

/**
 * Maps a 0–100 score to its heatmap label and visual tokens.
 *
 * Thresholds are 0–39, 40–54, 55–69, 70–84, and 85–100.
 *
 * @param score - Place score on the same scale used by `HEATMAP_STEPS`.
 * @returns The matching heatmap band.
 */
export function getHeatmapClassification(score: number): HeatmapClassification {
  if (score < 40) return HEATMAP_STEPS[0];
  if (score < 55) return HEATMAP_STEPS[1];
  if (score < 70) return HEATMAP_STEPS[2];
  if (score < 85) return HEATMAP_STEPS[3];
  return HEATMAP_STEPS[4];
}
