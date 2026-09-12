import { srtToVtt } from '$lib/api/subtitles';
import { checkOrigin, checkRateLimit } from '$lib/server/requestGuard';
import { fetchWithTimeout } from '$lib/utils/fetchWithTimeout';

const ALLOWED_SUBTITLE_HOST_SUFFIX = '.strem.io';

function isAllowedSubtitleUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    return parsed.hostname === 'strem.io' || parsed.hostname.endsWith(ALLOWED_SUBTITLE_HOST_SUFFIX);
  } catch {
    return false;
  }
}

export async function GET({ url, request, getClientAddress }) {
  if (!checkOrigin(request.headers)) {
    return new Response('Forbidden', { status: 403 });
  }

  if (!checkRateLimit(getClientAddress())) {
    return new Response('Too Many Requests', { status: 429 });
  }

  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  if (!isAllowedSubtitleUrl(targetUrl)) {
    return new Response('URL not allowed', { status: 400 });
  }

  try {
    const res = await fetchWithTimeout(targetUrl, {}, 12000);
    if (!res.ok) {
      return new Response('Failed to fetch subtitle', { status: 500 });
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
    return new Response('Error fetching subtitle', { status: 500 });
  }
}
