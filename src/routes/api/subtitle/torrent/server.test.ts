import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './+server';
import { __resetRateLimitForTests } from '$lib/server/requestGuard';

function makeEvent(searchParams: Record<string, string>, headers: Record<string, string> = {}) {
  const url = new URL('http://localhost:1420/api/subtitle/torrent');
  for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v);
  return {
    url,
    request: { headers: new Headers(headers) },
    getClientAddress: () => '127.0.0.1'
  } as any;
}

const validHash = 'a'.repeat(40);

describe('GET /api/subtitle/torrent', () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '1\n00:00:01,000 --> 00:00:02,000\nHi'
    });
  });

  it('returns 400 when infoHash is missing', async () => {
    const res = await GET(makeEvent({ fileIdx: '0' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when infoHash is not a valid 40-char hex hash', async () => {
    const res = await GET(makeEvent({ infoHash: '../../etc/passwd', fileIdx: '0' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when fileIdx is not a non-negative integer', async () => {
    const res = await GET(makeEvent({ infoHash: validHash, fileIdx: '-1' }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when Origin header is not allowed', async () => {
    const res = await GET(
      makeEvent({ infoHash: validHash, fileIdx: '0' }, { Origin: 'https://evil.example.com' })
    );
    expect(res.status).toBe(403);
  });

  it('returns 200 and converts SRT to VTT for a valid request', async () => {
    const res = await GET(makeEvent({ infoHash: validHash, fileIdx: '0' }));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.startsWith('WEBVTT')).toBe(true);
  });

  it('returns 429 once the per-IP rate limit is exceeded', async () => {
    for (let i = 0; i < 30; i++) {
      await GET(makeEvent({ infoHash: validHash, fileIdx: '0' }));
    }
    const res = await GET(makeEvent({ infoHash: validHash, fileIdx: '0' }));
    expect(res.status).toBe(429);
  });
});
