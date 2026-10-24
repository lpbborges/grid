import { SvelteSet } from 'svelte/reactivity';
import type { ErrorAction, PageError } from '$lib/utils/pageError';

export interface PlaybackErrorHandlers {
  onRetry?: () => void;
  onOtherSource?: () => void;
  onRetryLookup?: () => void;
  onReload?: () => void;
}

export function usePlaybackErrors() {
  let error = $state<PageError | null>(null);
  let lastStartOver = false;
  const failedSources = new SvelteSet<string>();

  function reset() {
    error = null;
    lastStartOver = false;
    failedSources.clear();
  }

  function setError(message: string, action: ErrorAction) {
    error = { message, action };
  }

  function clearError() {
    error = null;
  }

  function handleAction(action: ErrorAction, handlers: PlaybackErrorHandlers) {
    if (action === 'reload') {
      if (handlers.onReload) {
        handlers.onReload();
      } else if (typeof window !== 'undefined') {
        window.location.reload();
      }
      return;
    }
    if (action === 'otherSource') {
      handlers.onOtherSource?.();
      return;
    }
    if (action === 'retry') {
      if (handlers.onRetryLookup) {
        handlers.onRetryLookup();
      } else {
        handlers.onRetry?.();
      }
      return;
    }
    error = null;
  }

  return {
    get error() {
      return error;
    },
    set error(val: PageError | null) {
      error = val;
    },
    get lastStartOver() {
      return lastStartOver;
    },
    set lastStartOver(val: boolean) {
      lastStartOver = val;
    },
    failedSources,
    reset,
    setError,
    clearError,
    handleAction
  };
}
