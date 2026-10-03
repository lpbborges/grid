import { describe, expect, it } from 'vitest';
import { bootDelay } from './bootDelay';

describe('bootDelay', () => {
  it('steps 40ms per card and stops growing after the twelfth', () => {
    expect(bootDelay(0)).toBe('animation-delay: 0ms');
    expect(bootDelay(3)).toBe('animation-delay: 120ms');
    expect(bootDelay(11)).toBe('animation-delay: 440ms');
    expect(bootDelay(40)).toBe('animation-delay: 440ms');
  });
});
