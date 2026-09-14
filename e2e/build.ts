import { spawnSync } from 'node:child_process';
import { MOCK_BASE } from './support/mockServer.ts';
import { REPO_ROOT } from './support/swarm.ts';

const result = spawnSync(
  'npx',
  ['tauri', 'build', '--debug', '--no-bundle', '--config', 'e2e/tauri.e2e.conf.json'],
  {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.argv.includes('--live')
      ? { ...process.env }
      : { ...process.env, VITE_E2E_API_BASE: MOCK_BASE }
  }
);
process.exit(result.status ?? 1);
