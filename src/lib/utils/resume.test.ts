import { describe, it, expect } from 'vitest';
import { resumeSeconds } from './resume';

describe('resumeSeconds', () => {
  it('offers to resume from a minute in', () => {
    expect(resumeSeconds({ time: 2530, duration: 6000, updatedAt: 1 })).toBe(2530);
    expect(resumeSeconds({ time: 60, duration: 6000, updatedAt: 1 })).toBe(60);
  });

  it('starts normally without progress or under a minute', () => {
    expect(resumeSeconds(undefined)).toBeNull();
    expect(resumeSeconds({ time: 59, duration: 6000, updatedAt: 1 })).toBeNull();
  });
});
