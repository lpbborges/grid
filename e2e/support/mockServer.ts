import http from 'node:http';
import {
  POSTER,
  type Catalog,
  type CatalogMovie,
  type CatalogSeries,
  type StreamEntry
} from './catalog.ts';

export const MOCK_PORT = 47100;
export const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`;
export const TRACKER_URL = `${MOCK_BASE}/announce`;
export const APP_TRACKER_URL = `${MOCK_BASE}/announce-app`;

export interface MockServerOptions {
  appPeerPorts: number[];
  stalledConnections: () => number;
}

export interface MockServer {
  announces: () => number;
  unexpectedRequests: string[];
  close(): Promise<void>;
}

function movieMeta(movie: CatalogMovie) {
  return {
    id: movie.id,
    imdb_id: movie.id,
    type: 'movie',
    name: movie.title,
    year: '2026',
    released: '2026-01-01T00:00:00.000Z',
    imdbRating: '7.0',
    poster: POSTER,
    description: `${movie.title} synopsis`
  };
}

function seriesMeta(series: CatalogSeries) {
  return {
    id: series.id,
    imdb_id: series.id,
    type: 'series',
    name: series.title,
    year: '2026',
    released: '2026-01-01T00:00:00.000Z',
    imdbRating: '7.0',
    poster: POSTER,
    description: `${series.title} synopsis`,
    country: 'United States',
    genres: ['Drama', 'Sci-Fi'],
    videos: series.episodes.map((e) => ({
      id: `${series.id}:${e.season}:${e.episode}`,
      season: e.season,
      episode: e.episode,
      name: e.name
    }))
  };
}

function compactPeers(peerPorts: number[]): Buffer {
  const peers = Buffer.alloc(peerPorts.length * 6);
  peerPorts.forEach((port, index) => {
    peers.set([127, 0, 0, 1], index * 6);
    peers.writeUInt16BE(port, index * 6 + 4);
  });
  return Buffer.concat([
    Buffer.from(`d8:intervali5e5:peers${peers.length}:`),
    peers,
    Buffer.from('e')
  ]);
}

const QUALITY_FILTER = 'qualityfilter=threed,cam,scr';
const TORRENTIO_MOVIE = /^(?:[^/]+\/)?stream\/movie\/(tt\d+)\.json$/;
const TORRENTIO_EPISODE = /^(?:[^/]+\/)?stream\/series\/(tt\d+):(\d+):(\d+)\.json$/;

/** More seeds than the real release, so only the client filter keeps it from being picked. */
const CAM_RELEASE: StreamEntry = {
  name: 'Torrentio\n720p',
  title: 'Grid.Fixture.2026.HDCAM.x264-NOGRP\n👤 999',
  infoHash: 'c'.repeat(40),
  fileIdx: 0
};

export function startMockServer(catalog: Catalog, options: MockServerOptions): Promise<MockServer> {
  let announceCount = 0;
  const unexpectedRequests: string[] = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', MOCK_BASE);
    const send = (status: number, body: unknown) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === '/announce' || url.pathname === '/announce-app') {
      announceCount++;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(compactPeers(url.pathname === '/announce-app' ? options.appPeerPorts : []));
      return;
    }

    if (url.pathname === '/__e2e/state') {
      return send(200, {
        announces: announceCount,
        stalledConnections: options.stalledConnections(),
        unexpectedRequests
      });
    }

    const [service, ...rest] = url.pathname.split('/').filter(Boolean);
    const route = decodeURIComponent(rest.join('/'));

    // Torrentio would leave the cinema recording out when asked to; serving it anyway
    // proves the app drops it by itself, and asking without the filter is a failure.
    const sendStreams = (stream: StreamEntry) => {
      if (!route.includes(`|${QUALITY_FILTER}/`) && !route.startsWith(`${QUALITY_FILTER}/`)) {
        unexpectedRequests.push(`${url.pathname} (no quality filter)`);
      }
      return send(200, { streams: [CAM_RELEASE, stream] });
    };
    const movie = (id: string) => catalog.movies.find((m) => m.id === id);
    const series = (id: string) => catalog.series.find((s) => s.id === id);

    if (service === 'cinemeta') {
      if (route === 'catalog/movie/top.json')
        return send(200, { metas: catalog.movies.map(movieMeta) });
      if (route === 'catalog/series/top.json')
        return send(200, { metas: catalog.series.map(seriesMeta) });
      const search = route.match(/^catalog\/(movie|series)\/top\/search=(.*)\.json$/);
      if (search) {
        const query = search[2].toLowerCase();
        const metas =
          search[1] === 'movie'
            ? catalog.movies.filter((m) => m.title.toLowerCase().includes(query)).map(movieMeta)
            : catalog.series.filter((s) => s.title.toLowerCase().includes(query)).map(seriesMeta);
        return send(200, { metas });
      }
      if (/^catalog\/(movie|series)\/(top|year|imdbRating)(\/genre=[^/]+)?\.json$/.test(route))
        return send(200, { metas: [] });
      const movieMatch = route.match(/^meta\/movie\/(tt\d+)\.json$/);
      const found = movieMatch && movie(movieMatch[1]);
      if (found) return send(200, { meta: movieMeta(found) });
      const seriesMatch = route.match(/^meta\/series\/(tt\d+)\.json$/);
      const foundSeries = seriesMatch && series(seriesMatch[1]);
      if (foundSeries) return send(200, { meta: seriesMeta(foundSeries) });
    }

    if (service === 'moviesApi' && route === 'movie_details.json') {
      const found = movie(url.searchParams.get('imdb_id') ?? '');
      if (found) {
        return send(200, {
          status: 'ok',
          data: {
            movie: {
              id: found.id,
              imdb_code: found.id,
              title: found.title,
              year: 2026,
              rating: 7,
              summary: `${found.title} synopsis`,
              description_full: `${found.title} synopsis`,
              medium_cover_image: POSTER,
              large_cover_image: POSTER,
              language: 'english',
              torrents: []
            }
          }
        });
      }
    }

    if (service === 'torrentio') {
      const movieStream = route.match(TORRENTIO_MOVIE);
      const foundMovie = movieStream && movie(movieStream[1]);
      if (foundMovie) return sendStreams(foundMovie.stream);
      const episodeStream = route.match(TORRENTIO_EPISODE);
      if (episodeStream) {
        const episode = series(episodeStream[1])?.episodes.find(
          (e) => e.season === Number(episodeStream[2]) && e.episode === Number(episodeStream[3])
        );
        return episode ? sendStreams(episode.stream) : send(200, { streams: [] });
      }
    }

    if (service === 'wikidata' && route === 'w/api.php') {
      return send(
        200,
        url.searchParams.get('action') === 'wbgetentities' ? { entities: {} } : { search: [] }
      );
    }

    if (service === 'openSubtitles') return send(200, { subtitles: [] });
    if (service === 'googleTranslate' || service === 'myMemory') return send(503, {});

    unexpectedRequests.push(url.pathname + url.search);
    send(404, {});
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(MOCK_PORT, '127.0.0.1', () =>
      resolve({
        announces: () => announceCount,
        unexpectedRequests,
        close: () => new Promise((done) => server.close(() => done()))
      })
    );
  });
}
