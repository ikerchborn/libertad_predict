/** Behavioral tests for route ordering, anchors, custom costs, and optimizer limits. */
import { describe, expect, it } from 'vitest';
import type { Place } from '@/lib/types';
import {
  haversineKm,
  MAX_OPTIMIZABLE_STOPS,
  optimizeDayRoute,
} from '@/lib/routeOptimizer';

function makePlace(id: number, lat: number, lon: number): Place {
  return {
    id,
    osm_id: id,
    name: `Lugar ${id}`,
    category: 'attraction',
    kind: 'attraction',
    coast_type: 'inland',
    lat,
    lon,
    address: null,
    score: null,
    confidence: null,
  };
}

describe('optimizeDayRoute', () => {
  it('returns a deterministic route without losing nearby or duplicate-coordinate stops', () => {
    const places = [
      makePlace(1, -8.1, -79.0),
      makePlace(2, -8.1001, -79.0001),
      makePlace(3, -8.1, -79.0),
    ];
    const result = optimizeDayRoute(places);

    expect(result).toHaveLength(places.length);
    expect(new Set(result.map((place) => place.id)).size).toBe(places.length);
    expect(optimizeDayRoute(places).map((place) => place.id)).toEqual(
      result.map((place) => place.id)
    );
    expect(haversineKm(places[0].lat, places[0].lon, places[1].lat, places[1].lon))
      .toBeLessThan(0.05);
  });

  it('rejects days above the documented stop limit', () => {
    const places = Array.from({ length: MAX_OPTIMIZABLE_STOPS + 1 }, (_, index) =>
      makePlace(index + 1, -8.1 + index / 1000, -79)
    );

    expect(() => optimizeDayRoute(places)).toThrow(RangeError);
  });
});
