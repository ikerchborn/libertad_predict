/** Behavioral tests for the stable transit-service facade and public contracts. */
import { describe, expect, it } from 'vitest';
import {
  calculateTaxiEstimate,
  isTransitWalkOverLimit,
  MAX_TRANSIT_WALK_METERS,
  sanitizeStopName,
  getTransitBetweenPlaces,
  resolveTransitBetweenPlaces,
  estimateTransitCostMinutes,
} from '@/lib/transitService';
import type { Place } from '@/lib/types';

const makePlace = (id: number, name: string, lat: number, lon: number): Place => ({
  id,
  osm_id: id,
  name,
  category: 'attraction',
  kind: 'attraction',
  coast_type: 'inland',
  lat,
  lon,
  address: null,
  score: null,
  confidence: null,
});

describe('urban transit walking access limit', () => {
  it('uses the same exact 800 m boundary for reported and enforced access distance', () => {
    expect(MAX_TRANSIT_WALK_METERS).toBe(800);
    expect(isTransitWalkOverLimit(799)).toBe(false);
    expect(isTransitWalkOverLimit(800)).toBe(false);
    expect(isTransitWalkOverLimit(801)).toBe(true);
  });

  describe('transit service public contracts', () => {
    it('estimates taxi fare ranges from distance', () => {
      expect(calculateTaxiEstimate(3)).toEqual({
        fareMin: 8,
        fareMax: 12,
        fareAvg: 10,
        estimatedMinutes: 6,
      });
    });

    it('replaces an inventory-only stop label with a readable reference', () => {
      expect(sanitizeStopName('Nodo 12', [-8.1, -79.0], 'Av. España')).toBe('Av. España');
    });

    it('keeps short journeys as walks and estimates only their walking time', () => {
      const origin = makePlace(1, 'Origen', -8.111, -79.03);
      const destination = makePlace(2, 'Destino', -8.112, -79.03);
      const transit = getTransitBetweenPlaces(origin, destination);

      expect(transit.vehicleType).toBe('caminata');
      expect(estimateTransitCostMinutes(origin, destination, 2.5, 15, transit))
        .toBe(transit.estimatedMinutes);
    });

    it('resolves short journeys through the public asynchronous API', async () => {
      const origin = makePlace(1, 'Origen', -8.111, -79.03);
      const destination = makePlace(2, 'Destino', -8.112, -79.03);

      await expect(resolveTransitBetweenPlaces(origin, destination))
        .resolves.toMatchObject({ vehicleType: 'caminata', farePen: 0 });
    });
  });
});
