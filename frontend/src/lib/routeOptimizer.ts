/** Geographic distance and bounded day-itinerary optimization helpers. */
import type { Place } from '@/lib/types';

/** Largest itinerary accepted by the quadratic route optimizer. */
export const MAX_OPTIMIZABLE_STOPS = 8;

/** Calculates great-circle distance between two latitude/longitude coordinates in kilometers. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Orders a day's places using nearest-neighbor starts followed by 2-opt improvement.
 *
 * The optional hotel anchor is included as the start and end of the cost calculation but is
 * not returned in the ordered places. By default, edges use straight-line distance; callers
 * can supply a multimodal cost such as estimated travel minutes.
 *
 * @throws {RangeError} When the itinerary contains more than `MAX_OPTIMIZABLE_STOPS`.
 */
export function optimizeDayRoute(
  places: Place[],
  hotelAnchor?: Place | null,
  edgeCost: (from: Place, to: Place) => number = (from, to) =>
    haversineKm(from.lat, from.lon, to.lat, to.lon)
): Place[] {
  if (places.length > MAX_OPTIMIZABLE_STOPS) {
    throw new RangeError(`Itinerary optimization supports at most ${MAX_OPTIMIZABLE_STOPS} stops.`);
  }
  if (places.length <= 1) return [...places];

  const costs = places.map((from) =>
    places.map((to) => edgeCost(from, to))
  );
  const anchorCosts = hotelAnchor
    ? {
        from: places.map((place) => edgeCost(hotelAnchor, place)),
        to: places.map((place) => edgeCost(place, hotelAnchor)),
      }
    : null;

  const routeCost = (route: number[]): number => {
    let total = anchorCosts ? anchorCosts.from[route[0]] : 0;
    for (let index = 1; index < route.length; index++) {
      total += costs[route[index - 1]][route[index]];
    }
    if (anchorCosts) total += anchorCosts.to[route[route.length - 1]];
    return total;
  };

  const buildNearestNeighborRoute = (firstIndex: number): number[] => {
    const remaining = new Set(places.map((_, index) => index));
    const route = [firstIndex];
    remaining.delete(firstIndex);

    while (remaining.size > 0) {
      const current = route[route.length - 1];
      let next = -1;
      let lowestCost = Infinity;
      for (const candidate of remaining) {
        if (costs[current][candidate] < lowestCost) {
          next = candidate;
          lowestCost = costs[current][candidate];
        }
      }
      route.push(next);
      remaining.delete(next);
    }
    return route;
  };

  let ordered = buildNearestNeighborRoute(0);
  for (let firstIndex = 1; firstIndex < places.length; firstIndex++) {
    const candidate = buildNearestNeighborRoute(firstIndex);
    if (routeCost(candidate) < routeCost(ordered)) ordered = candidate;
  }

  let improved = true;
  let iterations = 0;
  const maxIterations = 60;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 0; i < ordered.length - 1; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const candidate = [
          ...ordered.slice(0, i),
          ...ordered.slice(i, j + 1).reverse(),
          ...ordered.slice(j + 1),
        ];

        if (routeCost(candidate) + 0.0001 < routeCost(ordered)) {
          ordered = candidate;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return ordered.map((index) => places[index]);
}
