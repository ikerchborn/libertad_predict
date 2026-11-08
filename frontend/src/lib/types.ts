export type PlaceCategory = "attraction" | "hotel" | "restaurant";
export type PlaceKind = "attraction" | "lodging" | "food" | "activity" | "unclassified";
export type CoastType = "inland" | "coastal";

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

  // Differentiated scores
  convenience_score?: number | null;
  recommendation_score?: number | null;
  recommendation_summary?: string | null;

  // Commercial metadata
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

  // Dynamic mapped fields for UI
  zone?: "costa" | "valle" | "sierra";
  profile?: "surfer" | "culture" | "family";
  image?: string;
  description?: string;
  bestTime?: string;
  weatherText?: string;
  surfText?: string;
  crowdText?: string;
}

export interface Offer {
  kind: string; // dish | room | tour
  name: string;
  price: number;
  currency: string;
  captured_at: string;
}

export interface RecommendationFactor {
  name: string;
  score: number;
  weight: number;
  contribution: number;
  explanation: string;
}

export interface NearbyPlace {
  place: Place;
  distance_km: number;
  recommendation_score: number;
  summary: string;
  breakdown: RecommendationFactor[];
}

export interface PlaceReview {
  author_name: string;
  rating: number;
  text: string;
  relative_time?: string | null;
}

export interface CrimeIncidentSummary {
  name: string;
  count: number;
  percentage: number;
}

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

export interface FactorBreakdown {
  name: string;
  value: number;
  weight: number;
  contribution: number;
  data_source: string;
  data_date: string;
  explanation: string;
}

export interface CalendarDay {
  date: string;
  score: number;
  confidence: number;
  breakdown: FactorBreakdown[];
}

export interface CalendarResponse {
  place_id: number;
  date_from: string;
  date_to: string;
  days: CalendarDay[];
}

export interface ScoreDetail {
  place_id: number;
  date: string;
  score: number;
  confidence: number;
  breakdown: FactorBreakdown[];
  computed_at: string;
  weights_version: string;
}

export interface HeatmapClassification {
  level: number;
  name: string;
  rangeLabel: string;
  bgHex: string;
  textHex: string;
  borderHex: string;
  badgeClass: string;
}

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

export function getHeatmapClassification(score: number): HeatmapClassification {
  if (score < 40) return HEATMAP_STEPS[0];
  if (score < 55) return HEATMAP_STEPS[1];
  if (score < 70) return HEATMAP_STEPS[2];
  if (score < 85) return HEATMAP_STEPS[3];
  return HEATMAP_STEPS[4];
}
