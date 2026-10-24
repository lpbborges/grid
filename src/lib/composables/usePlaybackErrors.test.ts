import { describe, it, expect, vi } from 'vitest';
import { usePlaybackErrors } from './usePlaybackErrors.svelte';

describe('usePlaybackErrors', () => {
  it('manages error state, failedSources and reset', () => {
    const playbackErrors = usePlaybackErrors();
    expect(playbackErrors.error).toBeNull();

    playbackErrors.setError('Test error', 'retry');
    expect(playbackErrors.error).toEqual({ message: 'Test error', action: 'retry' });

    playbackErrors.failedSources.add('hash1');
    playbackErrors.lastStartOver = true;
    expect(playbackErrors.failedSources.has('hash1')).toBe(true);
    expect(playbackErrors.lastStartOver).toBe(true);

    playbackErrors.reset();
    expect(playbackErrors.error).toBeNull();
    expect(playbackErrors.failedSources.size).toBe(0);
    expect(playbackErrors.lastStartOver).toBe(false);
  });

  it('dispatches handleAction correctly', () => {
    const playbackErrors = usePlaybackErrors();
    const onRetry = vi.fn();
    const onOtherSource = vi.fn();
    const onRetryLookup = vi.fn();
    const onReload = vi.fn();

    playbackErrors.setError('Error', 'otherSource');
    playbackErrors.handleAction('otherSource', { onOtherSource });
    expect(onOtherSource).toHaveBeenCalledTimes(1);

    playbackErrors.handleAction('retry', { onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);

    playbackErrors.handleAction('retry', { onRetryLookup, onRetry });
    expect(onRetryLookup).toHaveBeenCalledTimes(1);

    playbackErrors.handleAction('reload', { onReload });
    expect(onReload).toHaveBeenCalledTimes(1);

    playbackErrors.handleAction('back', {});
    expect(playbackErrors.error).toBeNull();
  });
});
