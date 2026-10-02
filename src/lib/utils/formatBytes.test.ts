import { describe, it, expect } from 'vitest';
import { BYTES_PER_GB, formatGigabytes } from './formatBytes';

describe('formatGigabytes', () => {
  it('shows gigabytes with at most one decimal, in pt-BR', () => {
    expect(formatGigabytes(2.14 * BYTES_PER_GB)).toBe('2,1 GB');
    expect(formatGigabytes(3 * BYTES_PER_GB)).toBe('3 GB');
  });

  it('shows an empty cache as 0 GB', () => {
    expect(formatGigabytes(0)).toBe('0 GB');
  });
});
