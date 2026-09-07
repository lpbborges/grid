import { srtToVtt } from '$lib/api/subtitles';

export async function GET({ url }) {
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  try {
    const res = await fetch(targetUrl);
    if (!res.ok) {
      return new Response('Failed to fetch subtitle', { status: 500 });
    }

    // We assume the text is SRT.
    // If it's already VTT, the conversion won't hurt much or we can check for WEBVTT.
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
