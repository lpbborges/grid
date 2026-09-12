import { srtToVtt } from '$lib/api/subtitles';
import { getStreamUrl, isValidInfoHash, isValidFileIdx } from '$lib/engine/torrent';
import { checkOrigin, checkRateLimit } from '$lib/server/requestGuard';
import { fetchWithTimeout } from '$lib/utils/fetchWithTimeout';

export async function GET({ url, request, getClientAddress }) {
  if (!checkOrigin(request.headers)) {
    return new Response('Forbidden', { status: 403 });
  }

  if (!checkRateLimit(getClientAddress())) {
    return new Response('Too Many Requests', { status: 429 });
  }

  const infoHash = url.searchParams.get('infoHash');
  const fileIdxRaw = url.searchParams.get('fileIdx');

  if (!infoHash || !fileIdxRaw) {
    return new Response('Missing parameters', { status: 400 });
  }

  const fileIdx = parseInt(fileIdxRaw, 10);

  if (!isValidInfoHash(infoHash) || !isValidFileIdx(fileIdx)) {
    return new Response('Invalid parameters', { status: 400 });
  }

  try {
    const targetUrl = getStreamUrl(infoHash, fileIdx);
    const res = await fetchWithTimeout(targetUrl, {}, 12000);

    if (!res.ok) {
      return new Response('Failed to fetch subtitle from torrent engine', { status: 500 });
    }

    const text = await res.text();
    let vtt = text;
    if (!text.trim().startsWith('WEBVTT')) {
      vtt = srtToVtt(text);
    }

    return new Response(vtt, {
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  } catch {
    return new Response('Error fetching torrent subtitle', { status: 500 });
  }
}
