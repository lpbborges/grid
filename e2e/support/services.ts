import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildCatalog, type Catalog } from './catalog.ts';
import { startMockServer, TRACKER_URL, type MockServer } from './mockServer.ts';
import { startSeeders, stopSeeders, type Seeder } from './swarm.ts';

export interface E2eServices {
  seeders: Seeder[];
  catalog: Catalog;
  mock: MockServer;
  trackersFile: string;
  stop(): Promise<void>;
}

export async function startE2eServices(): Promise<E2eServices> {
  const seeders = await startSeeders(TRACKER_URL);
  const catalog = buildCatalog(seeders);
  const mock = await startMockServer(
    catalog,
    seeders.map((s) => s.peerPort)
  );
  const workDir = mkdtempSync(path.join(tmpdir(), 'grid-play-e2e-'));
  const trackersFile = path.join(workDir, 'trackers.txt');
  writeFileSync(trackersFile, `${TRACKER_URL}\n`);
  return {
    seeders,
    catalog,
    mock,
    trackersFile,
    async stop() {
      await stopSeeders(seeders);
      await mock.close();
      rmSync(workDir, { recursive: true, force: true });
    }
  };
}
