import type { FixtureName, Seeder } from './swarm.ts';

export const POSTER =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#1a1a2e"/></svg>'
  ).toString('base64');

export const MKV_MOVIE = { id: 'tt9000001', title: 'Grid Play Fixture MKV' };
export const MP4_MOVIE = { id: 'tt9000002', title: 'Grid Play Fixture MP4' };
export const FIXTURE_SERIES = { id: 'tt9000003', title: 'Grid Play Fixture Series' };

export interface StreamEntry {
  name: string;
  title: string;
  infoHash: string;
  fileIdx: number;
}

export interface CatalogMovie {
  id: string;
  title: string;
  stream: StreamEntry;
}

export interface CatalogEpisode {
  season: number;
  episode: number;
  name: string;
  stream: StreamEntry;
}

export interface CatalogSeries {
  id: string;
  title: string;
  episodes: CatalogEpisode[];
}

export interface Catalog {
  movies: CatalogMovie[];
  series: CatalogSeries[];
}

function seederFor(seeders: Seeder[], fixture: FixtureName): Seeder {
  const seeder = seeders.find((s) => s.fixture === fixture);
  if (!seeder) throw new Error(`No seeder for ${fixture}`);
  return seeder;
}

function streamFor(seeder: Seeder, fileSuffix: string): StreamEntry {
  const fileIdx = seeder.files.findIndex((file) => file.name.endsWith(fileSuffix));
  if (fileIdx === -1) throw new Error(`No file ending in ${fileSuffix} in ${seeder.fixture}`);
  return {
    name: 'Torrentio\n1080p',
    title: `${seeder.files[fileIdx].name}\n👤 25`,
    infoHash: seeder.infoHash,
    fileIdx
  };
}

export function buildCatalog(seeders: Seeder[]): Catalog {
  const series = seederFor(seeders, 'series');
  return {
    movies: [
      { ...MKV_MOVIE, stream: streamFor(seederFor(seeders, 'movie-mkv'), '.mkv') },
      { ...MP4_MOVIE, stream: streamFor(seederFor(seeders, 'movie-mp4'), '.mp4') }
    ],
    series: [
      {
        ...FIXTURE_SERIES,
        episodes: [
          {
            season: 1,
            episode: 1,
            name: 'Fixture Pilot',
            stream: streamFor(series, 'S01E01.1080p.mkv')
          },
          {
            season: 1,
            episode: 2,
            name: 'Fixture Finale',
            stream: streamFor(series, 'S01E02.1080p.mkv')
          }
        ]
      }
    ]
  };
}
