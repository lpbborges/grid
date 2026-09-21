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
      : {
          ...process.env,
          VITE_E2E_API_BASE: MOCK_BASE,
          // Keep the existing specs on the <video> element, including on
          // Windows, where playback would otherwise go to mpv, whose surface
          // WebDriver cannot see into. A dedicated spec covers the native path
          // with VITE_GRID_NATIVE_PLAYER=on.
          VITE_GRID_NATIVE_PLAYER: process.argv.includes('--native')
            ? 'on'
            : (process.env.VITE_GRID_NATIVE_PLAYER ?? 'off')
        }
  }
);
process.exit(result.status ?? 1);
