/** Contract tests for OSRM routing results, validation, timeout, and approximate fallback. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOsrmRoute } from '@/lib/osrmService';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchOsrmRoute', () => {
  it('returns a street route when OSRM returns valid geometry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          routes: [
            {
              distance: 1500,
              duration: 600,
              geometry: { coordinates: [[-79.0, -8.1], [-79.01, -8.11]] },
            },
          ],
        }),
      })
    );

    await expect(fetchOsrmRoute([[-8.1, -79], [-8.11, -79.01]], 'driving')).resolves.toEqual({
      coordinates: [[-8.1, -79], [-8.11, -79.01]],
      distanceKm: 1.5,
      durationMin: 10,
      isFallback: false,
    });
  });

  it('marks direct connectors as approximate after OSRM fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

    const result = await fetchOsrmRoute([[-8.1, -79], [-8.11, -79.01]], 'driving');

    expect(result?.isFallback).toBe(true);
    expect(result?.fallbackReason).toBe('No se pudo validar la ruta sobre la red vial.');
    expect(result?.coordinates).toEqual([[-8.1, -79], [-8.11, -79.01]]);
    expect(result?.distanceKm).toBeGreaterThan(0);
  });

  it('clearly identifies the four-second routing timeout fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    );

    const result = await fetchOsrmRoute([[-8.1, -79], [-8.11, -79.01]], 'walking');

    expect(result?.isFallback).toBe(true);
    expect(result?.fallbackReason).toBe('El cálculo de calles excedió 4 segundos.');
  });

  it('rejects invalid waypoints instead of creating a misleading connector', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOsrmRoute([[Number.NaN, -79], [-8.11, -79.01]])).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
