import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a falsy context instead of dropping it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('retry', 0);
    logger.warn('flag', false);
    logger.warn('name', '');

    expect(warn.mock.calls).toEqual([
      ['retry', 0],
      ['flag', false],
      ['name', '']
    ]);
  });

  it('logs only the message when no context is given', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.error('failed');

    expect(error).toHaveBeenCalledWith('failed');
    expect(error.mock.calls[0]).toHaveLength(1);
  });
});
