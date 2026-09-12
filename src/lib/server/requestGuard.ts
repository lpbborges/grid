export const ALLOWED_ORIGINS = ['http://localhost:1420', 'http://127.0.0.1:1420'];

export function checkOrigin(headers: Headers): boolean {
  const origin = headers.get('Origin');
  if (origin) {
    return ALLOWED_ORIGINS.includes(origin);
  }

  const referer = headers.get('Referer');
  if (referer) {
    try {
      return ALLOWED_ORIGINS.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }

  // No Origin and no Referer: treat as same-origin webview request.
  return true;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
let rateLimitState = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(clientIp: string, limitPerMinute = 30): boolean {
  const now = Date.now();
  const entry = rateLimitState.get(clientIp);

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitState.set(clientIp, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= limitPerMinute) {
    return false;
  }

  entry.count += 1;
  return true;
}

export function __resetRateLimitForTests(): void {
  rateLimitState = new Map();
}
