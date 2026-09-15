import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import MoviePage from './+page.svelte';
import {
  installPlaybackBoundary,
  PROXY_ORIGIN,
  type PlaybackBoundary,
  type PlaybackBoundaryOptions
} from '$lib/engine/__fixtures__/playbackBoundary';
import { settingsStore } from '$lib/stores/settings.svelte';
import { clearExternalSubtitleCache } from '$lib/api/subtitles';
import { ADD_ATTEMPT_TIMEOUTS_MS } from '$lib/engine/torrent';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const HASH = '792b54cacb8c5d54cf8941b6215cbb9bdf08632c';
const VIDEO = 'Grid.Play.Fixture.2026.1080p.mkv';
const SUBTITLE = 'Grid.Play.Fixture.2026.1080p.en.srt';
const POSTER = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const DEFAULT_CACHE_LIMIT = 3 * 1024 * 1024 * 1024;

const movie = {
  id: 'tt0000001',
  title: 'Grid Play Fixture',
  year: 2026,
  rating: 7,
  summary: 'Fixture movie',
  description_full: 'Fixture movie',
  medium_cover_image: POSTER,
  large_cover_image: POSTER,
  language: 'en',
  torrents: []
};

const baseOptions: PlaybackBoundaryOptions = {
  files: [
    { name: SUBTITLE, length: 50 },
    { name: VIDEO, length: 259767 }
  ],
  streams: [{ name: 'Torrentio\n1080p', title: `${VIDEO}\n👤 12`, infoHash: HASH, fileIdx: 1 }],
  externalSubtitles: [{ id: 'os-1', url: 'https://subs5.strem.io/en/fixture.srt', lang: 'eng' }]
};

let boundary: PlaybackBoundary;

async function openAndPlay(overrides: Partial<PlaybackBoundaryOptions> = {}) {
  boundary = installPlaybackBoundary({ ...baseOptions, ...overrides });
  render(MoviePage, { props: { data: { movieId: movie.id, movie, error: null } } });
  await fireEvent.click(await screen.findByRole('button', { name: /reproduzir/i }));
}

function rqbitRequest(method: string, path: string) {
  return boundary.rqbit.requests.find((r) => r.method === method && r.path === path);
}

describe('Movie playback wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    settingsStore.cacheLimitBytes = DEFAULT_CACHE_LIMIT;
    clearExternalSubtitleCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    settingsStore.cacheLimitBytes = DEFAULT_CACHE_LIMIT;
  });

  it('plays the selected file through the stream proxy without reaching the network', async () => {
    await openAndPlay();

    const video = await screen.findByTestId('video-element', {}, { timeout: 5000 });
    await waitFor(() =>
      expect(video.getAttribute('src')).toBe(`${PROXY_ORIGIN}/torrents/${HASH}/stream/1`)
    );
    expect(boundary.unhandledRequests).toEqual([]);
  });

  it('adds the magnet again and plays when the first add stalls', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await openAndPlay({ stallAdds: 1 });
    const adds = () =>
      boundary.rqbit.requests.filter((r) => r.method === 'POST' && r.path === '/torrents');
    await waitFor(() => expect(adds()).toHaveLength(1));

    await vi.advanceTimersByTimeAsync(ADD_ATTEMPT_TIMEOUTS_MS[0]);

    expect(adds()).toHaveLength(2);
    const video = await screen.findByTestId('video-element', {}, { timeout: 5000 });
    await waitFor(() =>
      expect(video.getAttribute('src')).toBe(`${PROXY_ORIGIN}/torrents/${HASH}/stream/1`)
    );
    expect(boundary.unhandledRequests).toEqual([]);
  });

  it('stops preparing the stream when the player closes during a stalled add', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await openAndPlay({ stallAdds: 1 });
    const adds = () =>
      boundary.rqbit.requests.filter((r) => r.method === 'POST' && r.path === '/torrents');
    await waitFor(() => expect(adds()).toHaveLength(1));

    await fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await vi.advanceTimersByTimeAsync(
      ADD_ATTEMPT_TIMEOUTS_MS.reduce((total, timeout) => total + timeout, 0)
    );

    expect(adds()).toHaveLength(1);
    expect(boundary.rqbit.loaded.size).toBe(0);
    expect(screen.queryByTestId('video-element')).not.toBeInTheDocument();
    expect(screen.queryByText(/não foi possível/i)).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /reproduzir/i })).toBeInTheDocument();
  });

  it('adds the magnet with the file filter and downloads only the video and its subtitle', async () => {
    await openAndPlay();
    await screen.findByTestId('video-element', {}, { timeout: 5000 });

    const add = rqbitRequest('POST', '/torrents');
    expect(add?.body).toContain(`xt=urn:btih:${HASH}`);
    expect(add?.search.get('overwrite')).toBe('true');
    expect(add?.search.get('sub_folder')).toBe(HASH);
    expect(add?.search.get('only_files_regex')).toBe('(?i)\\.(mp4|mkv|webm|srt|vtt)$');
    expect(rqbitRequest('GET', `/torrents/${HASH}/stats/v1`)).toBeDefined();

    const update = rqbitRequest('POST', `/torrents/${HASH}/update_only_files`);
    expect(JSON.parse(update?.body ?? '{}')).toEqual({ only_files: [1, 0] });
  });

  it('loads the bundled and the external subtitles', async () => {
    await openAndPlay();
    await screen.findByTestId('video-element', {}, { timeout: 5000 });

    const commands = boundary.invokeCalls;
    expect(commands).toContainEqual({
      command: 'fetch_torrent_subtitle',
      args: { infoHash: HASH, fileIdx: 0 }
    });
    expect(commands).toContainEqual({
      command: 'fetch_external_subtitle',
      args: { url: 'https://subs5.strem.io/en/fixture.srt' }
    });
  });

  it('records a cacheable stream and forgets it from the engine when the player closes', async () => {
    await openAndPlay();
    await screen.findByTestId('video-element', {}, { timeout: 5000 });

    await fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    await waitFor(() => expect(rqbitRequest('POST', `/torrents/${HASH}/forget`)).toBeDefined());
    expect(rqbitRequest('POST', `/torrents/${HASH}/delete`)).toBeUndefined();
    const upserts = boundary.invokeCalls.filter((c) => c.command === 'upsert_cache_entry');
    expect(upserts.at(-1)?.args).toMatchObject({
      entry: {
        infoHash: HASH,
        mediaId: movie.id,
        fileName: `${HASH}/${VIDEO}`,
        totalBytes: 259767,
        downloadedBytes: 259817,
        complete: true
      }
    });
    expect(await screen.findByRole('button', { name: /reproduzir/i })).toBeInTheDocument();
  });

  // Closing the player writes the cache entry before forgetting the torrent.
  // Playing again re-adds the same info hash, so that late forget must not
  // remove the torrent the new stream waits on (Windows CI, run 35036299512).
  it('keeps the re-added title loaded when the previous cleanup finishes late', async () => {
    await openAndPlay({ cacheWriteDelayMs: 50 });
    await screen.findByTestId('video-element', {}, { timeout: 5000 });

    await fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await fireEvent.click(await screen.findByRole('button', { name: /reproduzir/i }));

    const adds = () =>
      boundary.rqbit.requests.filter((r) => r.method === 'POST' && r.path === '/torrents');
    await waitFor(() => expect(adds()).toHaveLength(2), { timeout: 5000 });
    // Let the delayed cache write, and the forget behind it, finish.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(boundary.rqbit.loaded.has(HASH)).toBe(true);
    const video = await screen.findByTestId('video-element', {}, { timeout: 5000 });
    expect(video.getAttribute('src')).toBe(`${PROXY_ORIGIN}/torrents/${HASH}/stream/1`);
    expect(boundary.unhandledRequests).toEqual([]);
  });

  it('deletes a stream that is too large for the cache when the player closes', async () => {
    settingsStore.cacheLimitBytes = 1000;
    await openAndPlay();
    await screen.findByTestId('video-element', {}, { timeout: 5000 });

    await fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    await waitFor(() => expect(rqbitRequest('POST', `/torrents/${HASH}/delete`)).toBeDefined());
    expect(boundary.invokeCalls.some((c) => c.command === 'upsert_cache_entry')).toBe(false);
  });

  it('asks the user to restart the app when the engine cannot start', async () => {
    await openAndPlay({ engineStartError: 'spawn failed' });

    expect(
      await screen.findByText(/não foi possível iniciar o player/i, {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('video-element')).not.toBeInTheDocument();
  });

  it('offers a retry when the engine rejects the stream', async () => {
    await openAndPlay({ failAdd: true });

    expect(
      await screen.findByText(/não foi possível iniciar a reprodução/i, {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
    expect(screen.queryByTestId('video-element')).not.toBeInTheDocument();
  });
});
