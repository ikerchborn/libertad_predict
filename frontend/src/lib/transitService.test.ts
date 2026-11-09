import { describe, expect, it } from 'vitest';
import {
  isTransitWalkOverLimit,
  MAX_TRANSIT_WALK_METERS,
} from '@/lib/transitService';

describe('urban transit walking access limit', () => {
  it('uses the same exact 800 m boundary for reported and enforced access distance', () => {
    expect(MAX_TRANSIT_WALK_METERS).toBe(800);
    expect(isTransitWalkOverLimit(799)).toBe(false);
    expect(isTransitWalkOverLimit(800)).toBe(false);
    expect(isTransitWalkOverLimit(801)).toBe(true);
  });
});
