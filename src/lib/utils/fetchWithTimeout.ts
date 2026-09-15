const DEFAULT_TIMEOUT_MS = 12000;

export class FetchTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'FetchTimeoutError';
  }
}

// A caller signal (`options.signal`) aborts the request too. Its abort is
// rethrown as the signal's reason, never as a FetchTimeoutError, so callers
// that retry timeouts do not retry a cancellation.
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const { signal: callerSignal, ...init } = options;
  callerSignal?.throwIfAborted();

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new FetchTimeoutError(url, timeoutMs);
    }
    if (callerSignal?.aborted) {
      throw callerSignal.reason;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}
