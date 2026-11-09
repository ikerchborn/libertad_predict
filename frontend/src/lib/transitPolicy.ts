/** Centralizes product thresholds applied to walking access for transit stops. */
/** Maximum allowed one-way walking access from a place to a transit stop. */
export const MAX_TRANSIT_WALK_METERS = 800;
/** The same access boundary expressed in kilometers for route calculations. */
export const MAX_TRANSIT_WALK_KM = MAX_TRANSIT_WALK_METERS / 1000;

/** Returns whether a walking access exceeds the product limit; exactly 800 m remains allowed. */
export function isTransitWalkOverLimit(distanceMeters: number): boolean {
  return distanceMeters > MAX_TRANSIT_WALK_METERS;
}

/** Kilometer-based equivalent of `isTransitWalkOverLimit`. */
export function isTransitWalkOverLimitKm(distanceKm: number): boolean {
  return isTransitWalkOverLimit(distanceKm * 1000);
}
