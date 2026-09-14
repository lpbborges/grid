import { $, browser } from '@wdio/globals';

const MOCK_STATE_URL = 'http://127.0.0.1:47100/__e2e/state';

export interface VideoState {
  src: string;
  currentTime: number;
  duration: number;
  readyState: number;
  paused: boolean;
  errorCode: number | null;
  trackLabels: string[];
}

export function videoState(): Promise<VideoState | null> {
  return browser.execute(() => {
    const video = document.querySelector<HTMLVideoElement>('[data-testid="video-element"]');
    if (!video) return null;
    return {
      src: video.currentSrc,
      currentTime: video.currentTime,
      duration: video.duration,
      readyState: video.readyState,
      paused: video.paused,
      errorCode: video.error?.code ?? null,
      trackLabels: Array.from(video.textTracks).map((track) => track.label)
    };
  });
}

export async function waitForPlaybackPast(seconds: number, timeout = 90000): Promise<VideoState> {
  let last: VideoState | null = null;
  await browser.waitUntil(
    async () => {
      last = await videoState();
      if (last?.errorCode) throw new Error(`Video element reported MediaError ${last.errorCode}`);
      return !!last && last.readyState >= 3 && last.currentTime > seconds;
    },
    {
      timeout,
      interval: 250,
      timeoutMsg: `Video did not play past ${seconds}s`
    }
  );
  if (!last) throw new Error('Video element disappeared');
  return last;
}

export async function seekTo(seconds: number): Promise<void> {
  await browser.execute((target) => {
    const video = document.querySelector<HTMLVideoElement>('[data-testid="video-element"]');
    if (video) video.currentTime = target;
  }, seconds);
}

export async function mockState(): Promise<{ announces: number; unexpectedRequests: string[] }> {
  const response = await fetch(MOCK_STATE_URL);
  return (await response.json()) as { announces: number; unexpectedRequests: string[] };
}

export async function openTitle(type: 'movie' | 'series', id: string): Promise<void> {
  const card = await $(`a[href="/${type}/${id}"]`);
  await card.waitForClickable({ timeout: 30000 });
  await card.click();
}

export async function closePlayer(): Promise<void> {
  const close = await $('[data-testid="video-player-container"] button[aria-label="Fechar"]');
  await close.waitForClickable();
  await close.click();
}

export async function backToCatalog(): Promise<void> {
  const back = await $('a[href="/"]');
  await back.waitForClickable();
  await back.click();
}
