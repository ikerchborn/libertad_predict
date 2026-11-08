import type { Place } from '@/lib/types';

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

function calculateTourDistance(places: Place[], anchor?: Place | null): number {
  if (places.length === 0) return 0;
  let total = 0;
  let prev = anchor || places[0];

  const startIndex = anchor ? 0 : 1;
  for (let i = startIndex; i < places.length; i++) {
    total += haversineKm(prev.lat, prev.lon, places[i].lat, places[i].lon);
    prev = places[i];
  }

  if (anchor) {
    total += haversineKm(prev.lat, prev.lon, anchor.lat, anchor.lon);
  }
  return total;
}

/**
 * Optimizes a day itinerary using Nearest Neighbour + 2-opt local search (TREK logic).
 * If a hotelAnchor is provided, the route starts and returns to the hotel.
 */
export function optimizeDayRoute(places: Place[], hotelAnchor?: Place | null): Place[] {
  if (places.length <= 2) return [...places];

  const pool = [...places];
  const ordered: Place[] = [];

  // Step 1: Nearest Neighbour initialization
  let current = hotelAnchor || pool.shift()!;
  if (!hotelAnchor && current) {
    ordered.push(current);
  }

  while (pool.length > 0) {
    let bestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const d = haversineKm(current.lat, current.lon, pool[i].lat, pool[i].lon);
      if (d < minDist) {
        minDist = d;
        bestIdx = i;
      }
    }
    const [nextPlace] = pool.splice(bestIdx, 1);
    ordered.push(nextPlace);
    current = nextPlace;
  }

  // Step 2: 2-opt Heuristic optimization to untangle crossing paths
  let improved = true;
  let iterations = 0;
  const maxIterations = 60;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 0; i < ordered.length - 1; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        // Reverse segment [i, j]
        const candidate = [
          ...ordered.slice(0, i),
          ...ordered.slice(i, j + 1).reverse(),
          ...ordered.slice(j + 1),
        ];

        const oldDist = calculateTourDistance(ordered, hotelAnchor);
        const newDist = calculateTourDistance(candidate, hotelAnchor);

        if (newDist + 0.0001 < oldDist) {
          ordered.splice(0, ordered.length, ...candidate);
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return ordered;
}
