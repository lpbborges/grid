import { describe, it, expect } from 'vitest';
import { isRecord } from './isRecord';

describe('isRecord', () => {
  it('accepts plain objects only', () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
  });
});
