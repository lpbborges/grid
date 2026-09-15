import { MOCK_BASE } from './mockServer.ts';
import { startE2eServices } from './services.ts';

const services = await startE2eServices();
console.log(
  JSON.stringify(
    {
      mock: MOCK_BASE,
      trackersFile: services.trackersFile,
      seeders: services.seeders.map(({ fixture, infoHash, files }) => ({
        fixture,
        infoHash,
        files
      }))
    },
    null,
    2
  )
);

const shutdown = async () => {
  await services.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
