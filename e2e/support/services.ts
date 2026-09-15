import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildCatalog, type Catalog } from './catalog.ts';
import { ARTIFACTS } from './driver.ts';
import { APP_TRACKER_URL, startMockServer, TRACKER_URL, type MockServer } from './mockServer.ts';
import { startStallingPeer } from './stallingPeer.ts';
import { startSeeders, stopSeeders, type Seeder } from './swarm.ts';

export interface E2eServices {
  seeders: Seeder[];
  catalog: Catalog;
  mock: MockServer;
  trackersFile: string;
  stop(): Promise<void>;
}

export async function startE2eServices(): Promise<E2eServices> {
  const seeders = await startSeeders(TRACKER_URL, ARTIFACTS);
  const catalog = buildCatalog(seeders);
  const mkvSeeder = seeders.find((seeder) => seeder.fixture === 'movie-mkv');
  if (!mkvSeeder) throw new Error('No seeder for movie-mkv');
  const stallingPeer = await startStallingPeer(mkvSeeder.peerPort);
  const mock = await startMockServer(catalog, {
    appPeerPorts: seeders.map((seeder) =>
      seeder === mkvSeeder ? stallingPeer.port : seeder.peerPort
    ),
    stalledConnections: stallingPeer.stalledConnections
  });
  const workDir = mkdtempSync(path.join(tmpdir(), 'grid-e2e-'));
  const trackersFile = path.join(workDir, 'trackers.txt');
  writeFileSync(trackersFile, `${APP_TRACKER_URL}\n`);
  return {
    seeders,
    catalog,
    mock,
    trackersFile,
    async stop() {
      await stopSeeders(seeders);
      await stallingPeer.close();
      await mock.close();
      rmSync(workDir, { recursive: true, force: true });
    }
  };
}
