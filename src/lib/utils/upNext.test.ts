import { describe, it, expect } from 'vitest';
import { isNearEnd, upNextLeadSeconds, UP_NEXT_LEAD_SECONDS } from './upNext';

describe('isNearEnd', () => {
  it('is near the end in the last 30 seconds of an episode', () => {
    expect(isNearEnd(2670, 2700)).toBe(true);
    expect(isNearEnd(2669.9, 2700)).toBe(false);
  });

  it('stays near the end past the reported duration', () => {
    expect(isNearEnd(2705, 2700)).toBe(true);
  });

  it('scales the lead down for short files', () => {
    expect(upNextLeadSeconds(10)).toBe(2);
    expect(isNearEnd(8, 10)).toBe(true);
    expect(isNearEnd(7.9, 10)).toBe(false);
    expect(upNextLeadSeconds(3600)).toBe(UP_NEXT_LEAD_SECONDS);
  });

  it('is never near the end of a file with no known length', () => {
    expect(isNearEnd(0, 0)).toBe(false);
    expect(isNearEnd(10, Number.NaN)).toBe(false);
    expect(isNearEnd(10, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isNearEnd(Number.NaN, 100)).toBe(false);
  });
});
