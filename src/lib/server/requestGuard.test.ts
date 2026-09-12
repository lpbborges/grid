import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkOrigin,
  checkRateLimit,
  ALLOWED_ORIGINS,
  __resetRateLimitForTests
} from './requestGuard';

describe('checkOrigin', () => {
  it('allows a request with no Origin or Referer header', () => {
    expect(checkOrigin(new Headers())).toBe(true);
  });

  it('allows a request whose Origin matches the allowlist', () => {
    expect(checkOrigin(new Headers({ Origin: ALLOWED_ORIGINS[0] }))).toBe(true);
  });

  it('rejects a request whose Origin is not in the allowlist', () => {
    expect(checkOrigin(new Headers({ Origin: 'https://evil.example.com' }))).toBe(false);
  });

  it('allows a request whose Referer origin matches the allowlist', () => {
    expect(checkOrigin(new Headers({ Referer: `${ALLOWED_ORIGINS[0]}/movie/tt123` }))).toBe(true);
  });

  it('rejects a request whose Referer origin is not in the allowlist', () => {
    expect(checkOrigin(new Headers({ Referer: 'https://evil.example.com/x' }))).toBe(false);
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    vi.useRealTimers();
  });

  it('allows requests under the limit', () => {
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit('1.2.3.4', 30)).toBe(true);
    }
  });

  it('rejects the request once the limit is exceeded within the window', () => {
    for (let i = 0; i < 30; i++) {
      checkRateLimit('1.2.3.4', 30);
    }
    expect(checkRateLimit('1.2.3.4', 30)).toBe(false);
  });

  it('tracks limits independently per IP', () => {
    for (let i = 0; i < 30; i++) {
      checkRateLimit('1.2.3.4', 30);
    }
    expect(checkRateLimit('5.6.7.8', 30)).toBe(true);
  });
});
