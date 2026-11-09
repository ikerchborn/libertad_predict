/** Stable public facade for transit resolution, alternatives, and journey-time estimates. */
import type { Place } from '@/lib/types';
import { haversineKm } from '@/lib/routeOptimizer';
import type { TransitOption } from '@/lib/transitTypes';
import { getWalkingRoute } from '@/lib/transitGeometry';
import { resolveTruxdiTransit } from '@/lib/transitTruxdi';
import {
  getDirectTaxiOption,
  getFallbackTransitWithAccessLimit,
  getTransitBetweenPlaces,
  isInternalIntraZoneWalk,
  createInternalWalkOption,
} from '@/lib/transitFallbacks';
import { enrichTransitOption } from '@/lib/transitOptionMetadata';

export { MAX_TRANSIT_WALK_METERS, isTransitWalkOverLimit } from '@/lib/transitPolicy';
export { sanitizeStopName } from '@/lib/transitCatalog';
export type { TransitOption } from '@/lib/transitTypes';
export { calculateTaxiEstimate, getTransitBetweenPlaces } from '@/lib/transitFallbacks';

/**
 * Resolves the best available walking, Truxdi, or fallback transit option for a destination pair.
 *
 * Uses verified walking routes where available and applies the 800 m access limit to transit stops.
 */
export async function resolveTransitBetweenPlaces(
  origin: Place,
  destination: Place,
  urbanFare = 2.5
): Promise<TransitOption> {
  const directDistanceKm = haversineKm(
    origin.lat,
    origin.lon,
    destination.lat,
    destination.lon
  );
  if (isInternalIntraZoneWalk(origin, destination, directDistanceKm)) {
    const walkingRoute = await getWalkingRoute(
      [origin.lat, origin.lon],
      [destination.lat, destination.lon]
    );
    return enrichTransitOption(
      createInternalWalkOption(origin, destination, walkingRoute)
    );
  }
  if (directDistanceKm > 0.8) {
    const truxdiTransit = await resolveTruxdiTransit(origin, destination);
    return truxdiTransit
      ? enrichTransitOption(truxdiTransit)
      : getFallbackTransitWithAccessLimit(origin, destination, urbanFare);
  }

  const walkingRoute = await getWalkingRoute(
    [origin.lat, origin.lon],
    [destination.lat, destination.lon]
  );
  if (
    walkingRoute &&
    !walkingRoute.isFallback &&
    walkingRoute.distanceKm <= 0.9 &&
    walkingRoute.durationMin <= 12
  ) {
    return {
      code: 'WALK',
      serviceName: 'Caminata Peatonal',
      vehicleType: 'caminata',
      farePen: 0,
      estimatedMinutes: Math.max(1, walkingRoute.durationMin),
      waitMinutes: 0,
      boardingStop: origin.name,
      dropoffStop: destination.name,
      boardingPoint: [origin.lat, origin.lon],
      dropoffPoint: [destination.lat, destination.lon],
      routeGeometry: walkingRoute.coordinates,
      routeDistanceKm: walkingRoute.distanceKm,
      routeGeometryVerified: true,
      instructions: `Ruta peatonal por calles: ${walkingRoute.distanceKm.toFixed(1)} km, aproximadamente ${walkingRoute.durationMin} min.`,
    };
  }

  if (directDistanceKm <= 0.3 && (!walkingRoute || walkingRoute.isFallback)) {
    const shortWalk = getTransitBetweenPlaces(origin, destination, urbanFare);
    return walkingRoute
      ? {
          ...shortWalk,
          estimatedMinutes: Math.max(1, walkingRoute.durationMin),
          routeGeometry: walkingRoute.coordinates,
          routeDistanceKm: walkingRoute.distanceKm,
          routeGeometryVerified: false,
          warning: 'No se pudo confirmar la ruta peatonal por calles; el trazo es aproximado.',
        }
      : shortWalk;
  }

  const truxdiTransit = await resolveTruxdiTransit(origin, destination);
  const transit =
    truxdiTransit
      ? enrichTransitOption(truxdiTransit)
      : await getFallbackTransitWithAccessLimit(origin, destination, urbanFare);
  const reason = !walkingRoute || walkingRoute.isFallback
    ? 'No se pudo confirmar una ruta peatonal por calles;'
    : `La ruta peatonal mide ${walkingRoute.distanceKm.toFixed(1)} km y toma unos ${walkingRoute.durationMin} min;`;
  return {
    ...transit,
    warning: [
      transit.warning,
      `${reason} considera transporte o confirma el cruce peatonal antes de salir.`,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

/**
 * Offers a direct taxi alternative when the selected public-transit itinerary requires transfers.
 */
export function getTransitAlternatives(
  origin: Place,
  destination: Place,
  transit: TransitOption
): Array<{ id: 'transit' | 'direct-taxi'; label: string; transit: TransitOption }> {
  if (!transit.routeLegs || transit.routeLegs.length < 2) {
    return [{ id: 'transit', label: 'Ruta disponible', transit }];
  }

  const directTaxi = enrichTransitOption(getDirectTaxiOption(origin, destination));

  return [
    { id: 'transit', label: 'Transporte público · con transbordos', transit },
    { id: 'direct-taxi', label: 'Directo · taxi estimado', transit: directTaxi },
  ];
}

/**
 * Estimates total itinerary time including access walks, waits, and transfer penalties.
 */
export function estimateTransitCostMinutes(
  origin: Place,
  destination: Place,
  urbanFare = 2.5,
  transferPenaltyMinutes = 15,
  resolvedTransit?: TransitOption
): number {
  const transit = resolvedTransit ?? getTransitBetweenPlaces(origin, destination, urbanFare);
  if (transit.vehicleType === 'caminata') return transit.estimatedMinutes;

  const accessWalkKm = haversineKm(
    origin.lat,
    origin.lon,
    transit.boardingPoint[0],
    transit.boardingPoint[1]
  );
  const egressWalkKm = haversineKm(
    transit.dropoffPoint[0],
    transit.dropoffPoint[1],
    destination.lat,
    destination.lon
  );
  const routeLegs = transit.routeLegs ?? [];
  const transferWalkKm = routeLegs.slice(1).reduce((total, leg, index) => {
    const previousLeg = routeLegs[index];
    return total + haversineKm(
      previousLeg.dropoffPoint[0],
      previousLeg.dropoffPoint[1],
      leg.boardingPoint[0],
      leg.boardingPoint[1]
    );
  }, 0);
  const walkingMinutes = ((accessWalkKm + egressWalkKm + transferWalkKm) / 4.5) * 60;
  const transfers = Math.max(0, routeLegs.length - 1);

  const waitingMinutes = transit.routeLegs?.length
    ? transit.routeLegs.reduce((total, leg) => total + leg.waitMinutes, 0)
    : transit.waitMinutes;
  return walkingMinutes +
    transit.estimatedMinutes +
    waitingMinutes +
    transfers * transferPenaltyMinutes;
}