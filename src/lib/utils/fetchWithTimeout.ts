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
  options: RequestInit & { fetch?: typeof fetch } = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const { signal: callerSignal, fetch: customFetch, ...init } = options;
  callerSignal?.throwIfAborted();

  const fetchFn = customFetch || fetch;

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort();
  }, timeoutMs);

  const combinedSignal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutController.signal])
    : timeoutController.signal;

  try {
    return await fetchFn(url, { ...init, signal: combinedSignal });
  } catch (error) {
    if (callerSignal?.aborted) {
      throw callerSignal.reason;
    }
    if (timeoutController.signal.aborted) {
      throw new FetchTimeoutError(url, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
