import { srtToVtt } from '$lib/api/subtitles';
import { getStreamUrl } from '$lib/engine/torrent';

export async function GET({ url }) {
  const infoHash = url.searchParams.get('infoHash');
  const fileIdx = url.searchParams.get('fileIdx');

  if (!infoHash || !fileIdx) {
    return new Response('Missing parameters', { status: 400 });
  }

  try {
    const targetUrl = getStreamUrl(infoHash, parseInt(fileIdx, 10));
    const res = await fetch(targetUrl);

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
