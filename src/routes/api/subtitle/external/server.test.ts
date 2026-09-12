import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './+server';
import { __resetRateLimitForTests } from '$lib/server/requestGuard';

function makeEvent(searchParams: Record<string, string>, headers: Record<string, string> = {}) {
  const url = new URL('http://localhost:1420/api/subtitle/external');
  for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v);
  return {
    url,
    request: { headers: new Headers(headers) },
    getClientAddress: () => '127.0.0.1'
  } as any;
}

describe('GET /api/subtitle/external', () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '1\n00:00:01,000 --> 00:00:02,000\nHi'
    });
  });

  it('returns 400 when url is missing', async () => {
    const res = await GET(makeEvent({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when url host is not on the strem.io allowlist', async () => {
    const res = await GET(makeEvent({ url: 'https://evil.example.com/sub.srt' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when url scheme is not https', async () => {
    const res = await GET(makeEvent({ url: 'http://subs5.strem.io/sub.srt' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 for an allowlisted https strem.io host', async () => {
    const res = await GET(makeEvent({ url: 'https://subs5.strem.io/en/download/x/file/1' }));
    expect(res.status).toBe(200);
  });

  it('returns 403 when Origin header is not allowed', async () => {
    const res = await GET(
      makeEvent(
        { url: 'https://subs5.strem.io/en/download/x/file/1' },
        { Origin: 'https://evil.example.com' }
      )
    );
    expect(res.status).toBe(403);
  });

  it('returns 429 once the per-IP rate limit is exceeded', async () => {
    const params = { url: 'https://subs5.strem.io/en/download/x/file/1' };
    for (let i = 0; i < 30; i++) {
      await GET(makeEvent(params));
    }
    const res = await GET(makeEvent(params));
    expect(res.status).toBe(429);
  });
});
