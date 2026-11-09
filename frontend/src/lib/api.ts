/** Browser-side HTTP client for place discovery, details, nearby data, and scores. */
import { CalendarResponse, NearbyPlace, Place, PlaceDetail, PlaceKind, ScoreDetail } from "./types";

const API_BASE_URL = "/api";

/**
 * Fetches places for the catalog using the supplied optional filters and pagination.
 *
 * @throws {Error} When the API responds with a non-success status.
 */
export async function fetchPlaces(params?: {
  kind?: PlaceKind;
  category?: string;
  zone?: string;
  q?: string;
  date?: string;
  limit?: number;
  offset?: number;
}): Promise<Place[]> {
  const query = new URLSearchParams();
  if (params?.kind) query.set("kind", params.kind);
  if (params?.category) query.set("category", params.category);
  if (params?.zone) query.set("zone", params.zone);
  if (params?.q) query.set("q", params.q);
  if (params?.date) query.set("query_date", params.date);
  if (params?.limit !== undefined) query.set("limit", params.limit.toString());
  if (params?.offset !== undefined) query.set("offset", params.offset.toString());

  const url = `${API_BASE_URL}/places?${query.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Error en API places (${res.status}): ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetches one place and its details.
 *
 * @returns `null` when the API reports that the place does not exist.
 * @throws {Error} For other non-success responses.
 */
export async function fetchPlaceById(placeId: number, queryDate?: string): Promise<PlaceDetail | null> {
  const query = new URLSearchParams();
  if (queryDate) query.set("query_date", queryDate);
  const url = `${API_BASE_URL}/places/${placeId}?${query.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Error al consultar lugar ${placeId}: (${res.status}) ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetches nearby places of the requested kind.
 *
 * A non-success HTTP response is treated as an empty result; network errors still reject.
 */
export async function fetchNearbyPlaces(
  placeId: number,
  kind: "lodging" | "food" | "activity",
  limit: number = 4
): Promise<NearbyPlace[]> {
  const query = new URLSearchParams({ kind, limit: limit.toString() });
  const url = `${API_BASE_URL}/places/${placeId}/nearby?${query.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return [];
  }
  return res.json();
}

/** Fetches the score and factor breakdown for a place on one date. */
export async function fetchScores(
  placeId: number,
  dateStr: string
): Promise<ScoreDetail> {
  const url = `${API_BASE_URL}/scores/${placeId}?query_date=${dateStr}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      errorData.detail || `Error al consultar score para el destino ${placeId} (${res.status})`
    );
  }
  return res.json();
}

/** Fetches the calendar score series for a place and inclusive date window. */
export async function fetchCalendar(
  placeId: number,
  fromDate: string,
  toDate: string
): Promise<CalendarResponse> {
  const query = new URLSearchParams({
    place_id: placeId.toString(),
    from: fromDate,
    to: toDate,
  });
  const url = `${API_BASE_URL}/calendar?${query.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      errorData.detail || `Error al consultar calendario para el destino ${placeId} (${res.status})`
    );
  }
  return res.json();
}
