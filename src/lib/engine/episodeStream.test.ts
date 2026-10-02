import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildMagnet, getSeriesStreams, type Stream } from '$lib/api/torrentio';
import { findEpisodeStream } from './episodeStream';

vi.mock('$lib/api/torrentio', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/api/torrentio')>();
  return { ...original, getSeriesStreams: vi.fn(original.getSeriesStreams) };
});

const HASH_1080 = 'a'.repeat(40);
const HASH_720 = 'b'.repeat(40);
const SERIES = { id: 'tt0000002', title: 'Grid Series' };
const EPISODE = { season: 1, episode: 2 };
const PREFERENCES = { quality: '1080p', audio: 'original' as const };

function answerWith(streams: unknown[]) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ streams }), { status: 200 })
  );
}

const stream1080: Stream = {
  name: 'Torrentio\n1080p',
  title: 'Grid.Series.S01E02.1080p.mkv\n👤 12',
  infoHash: HASH_1080,
  fileIdx: 3,
  sources: ['tracker:udp://tracker.example:1337/announce']
};
const stream720: Stream = {
  name: 'Torrentio\n720p',
  title: 'Grid.Series.S01E02.720p.mkv\n👤 40',
  infoHash: HASH_720,
  fileIdx: 1
};

describe('findEpisodeStream', () => {
  beforeEach(() => {
    vi.mocked(getSeriesStreams).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('picks the best ranked source and builds its magnet with the episode name', async () => {
    answerWith([stream720, stream1080]);

    const found = await findEpisodeStream(SERIES, EPISODE, PREFERENCES);

    expect(found).toEqual({
      magnet: buildMagnet(HASH_1080, 'Grid Series S1E2', stream1080.sources),
      fileIdx: 3,
      infoHash: HASH_1080
    });
    expect(getSeriesStreams).toHaveBeenCalledWith('tt0000002', 1, 2);
  });

  it('prefers the configured quality', async () => {
    answerWith([stream1080, stream720]);

    const found = await findEpisodeStream(SERIES, EPISODE, { ...PREFERENCES, quality: '720p' });

    expect(found).toEqual({
      magnet: buildMagnet(HASH_720, 'Grid Series S1E2'),
      fileIdx: 1,
      infoHash: HASH_720
    });
  });

  it('skips the sources that already failed', async () => {
    answerWith([stream1080, stream720]);

    const found = await findEpisodeStream(SERIES, EPISODE, PREFERENCES, new Set([HASH_1080]));

    expect(found).toMatchObject({ infoHash: HASH_720 });
  });

  it('offers to go back once every source failed', async () => {
    answerWith([stream1080, stream720]);

    const found = await findEpisodeStream(
      SERIES,
      EPISODE,
      PREFERENCES,
      new Set([HASH_1080, HASH_720])
    );

    expect(found).toEqual({
      error: {
        message: 'Não encontramos outra fonte que funcione para este episódio.',
        action: 'back'
      }
    });
  });

  it('reports when the episode has no source', async () => {
    answerWith([]);

    expect(await findEpisodeStream(SERIES, EPISODE, PREFERENCES)).toEqual({
      error: { message: 'Este episódio ainda não está disponível para assistir.', action: 'back' }
    });
  });

  it('reports when no source carries an info hash', async () => {
    answerWith([{ name: 'Torrentio\n1080p', title: 'Direct link', url: 'https://example.com/x' }]);

    expect(await findEpisodeStream(SERIES, EPISODE, PREFERENCES)).toEqual({
      error: { message: 'Este episódio ainda não está disponível para assistir.', action: 'back' }
    });
  });

  it('offers to try again when the lookup fails', async () => {
    vi.mocked(getSeriesStreams).mockRejectedValueOnce(new Error('offline'));

    expect(await findEpisodeStream(SERIES, EPISODE, PREFERENCES)).toEqual({
      error: {
        message: 'Não foi possível buscar este episódio. Verifique sua conexão.',
        action: 'retry'
      }
    });
  });
});
