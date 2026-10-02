import { describe, it, expect } from 'vitest';
import { formatTime } from './formatTime';

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(65)).toBe('1:05');
  });

  it('adds hours when needed', () => {
    expect(formatTime(3700)).toBe('1:01:40');
  });

  it('treats a missing time as zero', () => {
    expect(formatTime(NaN)).toBe('0:00');
  });
});
