import { describe, it, expect, vi } from 'vitest';
import { logger } from '$lib/logger';
import { fulfilledValues } from './settled';

describe('fulfilledValues', () => {
  it('keeps the values that resolved, in order, and logs the ones that did not', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const results = await Promise.allSettled([
      Promise.resolve(1),
      Promise.reject(new Error('boom')),
      Promise.resolve(3)
    ]);

    expect(fulfilledValues(results, 'Failed to fetch a thing:')).toEqual([1, 3]);
    expect(warn).toHaveBeenCalledWith('Failed to fetch a thing:', expect.any(Error));
  });
});
