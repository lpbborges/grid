import { vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import type { Stream } from '$lib/api/torrentio';
import type { ExternalSubtitleEntry } from '$lib/types';
import { createFakeRqbit, type FakeRqbit, type FakeTorrentFile } from './fakeRqbit';
import type { NativeTrack } from '$lib/composables/useMpvBackend.svelte';

export const ENGINE_ORIGIN = 'http://127.0.0.1:41000';
export const PROXY_ORIGIN = 'http://127.0.0.1:42000';
export const FIXTURE_VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nGrid fixture\n';

export interface PlaybackBoundaryOptions {
  files: FakeTorrentFile[];
  streams: Stream[];
  externalSubtitles?: ExternalSubtitleEntry[];
  engineStartError?: unknown;
  failAdd?: boolean;
  stallAdds?: number;
  /** Delays `upsert_cache_entry`, like the slower IPC on Windows. */
  cacheWriteDelayMs?: number;
  /**
   * What `start_native_player` reports back. Only the native (libmpv) backend
   * asks, and mpv itself is never involved: these stand in for the in-process
   * libmpv the same way the fake rqbit stands in for the engine.
   */
  nativePlayback?: { tracks: NativeTrack[]; duration: number };
  nativeStartError?: unknown;
}

export interface InvokeCall {
  command: string;
  args: unknown;
}

export interface PlaybackBoundary {
  rqbit: FakeRqbit;
  invokeCalls: InvokeCall[];
  unhandledRequests: string[];
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function installPlaybackBoundary(options: PlaybackBoundaryOptions): PlaybackBoundary {
  const rqbit = createFakeRqbit({
    files: options.files,
    failAdd: options.failAdd,
    stallAdds: options.stallAdds
  });
  const invokeCalls: InvokeCall[] = [];
  const unhandledRequests: string[] = [];
  let blobCount = 0;

  async function handleInvoke(command: string, args?: unknown): Promise<unknown> {
    invokeCalls.push({ command, args });
    switch (command) {
      case 'start_torrent_engine':
        if (options.engineStartError !== undefined) throw options.engineStartError;
        return ENGINE_ORIGIN;
      case 'get_stream_proxy_url':
        return PROXY_ORIGIN;
      case 'get_cache_manifest':
        return [];
      case 'upsert_cache_entry':
        if (options.cacheWriteDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.cacheWriteDelayMs));
        }
        return undefined;
      case 'evict_for_space':
        return [];
      case 'fetch_torrent_subtitle':
      case 'fetch_external_subtitle':
        return FIXTURE_VTT;
      case 'cache_native_subtitles':
        return [];
      case 'start_native_player':
        if (options.nativeStartError !== undefined) throw options.nativeStartError;
        return options.nativePlayback ?? { tracks: [], duration: 0 };
      // The mid-playback controls: recorded in `invokeCalls`, answered with
      // nothing, exactly as mpv answers a `set_property`.
      case 'native_player_set_tracks':
      case 'native_player_set_paused':
      case 'native_player_seek':
      case 'native_player_set_volume':
      case 'native_player_select_audio':
      case 'native_player_select_subtitle':
      case 'stop_native_player':
        return undefined;
      default:
        throw new Error(`Unexpected IPC command: ${command}`);
    }
  }

  vi.mocked(invoke).mockImplementation(handleInvoke as typeof invoke);

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.origin === ENGINE_ORIGIN) return rqbit.handle(url, init);
      if (url.href.startsWith('https://torrentio.strem.fun/language=portuguese/stream/')) {
        return json({ streams: options.streams });
      }
      if (url.href.startsWith('https://opensubtitles-v3.strem.io/subtitles/')) {
        return json({ subtitles: options.externalSubtitles ?? [] });
      }
      unhandledRequests.push(url.href);
      return new Response('offline', { status: 503 });
    })
  );

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => `blob:fixture-${++blobCount}`)
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn()
  });
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLMediaElement.prototype.pause = vi.fn();

  return { rqbit, invokeCalls, unhandledRequests };
}
