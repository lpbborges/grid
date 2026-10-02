import { describe, it, expect } from 'vitest';
import { formatRuntime } from './formatRuntime';

describe('formatRuntime', () => {
  it('shows hours and minutes', () => {
    expect(formatRuntime('136 min')).toBe('2h 16min');
    expect(formatRuntime('120 min')).toBe('2h');
    expect(formatRuntime('45 min')).toBe('45min');
  });

  it('hides a runtime it cannot read', () => {
    expect(formatRuntime(undefined)).toBeUndefined();
    expect(formatRuntime('N/A')).toBeUndefined();
    expect(formatRuntime('0 min')).toBeUndefined();
  });
});
