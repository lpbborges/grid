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

// WebKitGTK can stay at HAVE_CURRENT_DATA (2) while it plays on after a seek.
export async function waitForPlaybackPast(
  seconds: number,
  timeout = 90000,
  minReadyState = 3
): Promise<VideoState> {
  let last: VideoState | null = null;
  await browser.waitUntil(
    async () => {
      last = await videoState();
      if (last?.errorCode) throw new Error(`Video element reported MediaError ${last.errorCode}`);
      return !!last && last.readyState >= minReadyState && last.currentTime > seconds;
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

export async function pauseVideo(): Promise<void> {
  await browser.execute(() => {
    document.querySelector<HTMLVideoElement>('[data-testid="video-element"]')?.pause();
  });
}

export async function seekTo(seconds: number): Promise<void> {
  await browser.execute((target) => {
    const video = document.querySelector<HTMLVideoElement>('[data-testid="video-element"]');
    if (video) video.currentTime = target;
  }, seconds);
}

export async function mockState(): Promise<{
  announces: number;
  stalledConnections: number;
  unexpectedRequests: string[];
}> {
  const response = await fetch(MOCK_STATE_URL);
  return (await response.json()) as {
    announces: number;
    stalledConnections: number;
    unexpectedRequests: string[];
  };
}

export async function waitForSplashToClear(): Promise<void> {
  await $('[data-testid="splash-grid"]').waitForExist({ reverse: true, timeout: 30000 });
}

export async function acceptDisclaimer(): Promise<void> {
  await waitForSplashToClear();
  const accept = await $('button=Entendi');
  if (!(await accept.isExisting())) return;
  await accept.click();
  await accept.waitForExist({ reverse: true });
}

export async function openTitle(type: 'movie' | 'series', id: string): Promise<void> {
  const card = await $(`a[href="/${type}/${id}"]`);
  await card.waitForExist({ timeout: 30000 });
  await acceptDisclaimer();
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
