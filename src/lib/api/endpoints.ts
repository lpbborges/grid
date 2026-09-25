const REAL_ENDPOINTS = {
  cinemeta: 'https://v3-cinemeta.strem.io',
  moviesApi: 'https://movies-api.accel.li/api/v2',
  torrentio: 'https://torrentio.strem.fun',
  openSubtitles: 'https://opensubtitles-v3.strem.io',
  googleTranslate: 'https://translate.googleapis.com',
  myMemory: 'https://api.mymemory.translated.net'
} as const;

export type EndpointName = keyof typeof REAL_ENDPOINTS;
export type Endpoints = Record<EndpointName, string>;

const LOOPBACK_BASE = /^http:\/\/127\.0\.0\.1:\d{1,5}$/;

export function resolveEndpoints(override: string | undefined): Endpoints {
  const base = override?.trim().replace(/\/+$/, '');
  if (!base) return { ...REAL_ENDPOINTS };
  if (!LOOPBACK_BASE.test(base)) {
    throw new Error(`VITE_E2E_API_BASE must look like http://127.0.0.1:<port>, got ${base}`);
  }
  const names = Object.keys(REAL_ENDPOINTS) as EndpointName[];
  return Object.fromEntries(names.map((name) => [name, `${base}/${name}`])) as Endpoints;
}

export const endpoints: Endpoints = resolveEndpoints(import.meta.env.VITE_E2E_API_BASE);

const PUBLIC_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce'
];

export function resolveDefaultTrackers(override: string | undefined): string[] {
  return override?.trim() ? [] : [...PUBLIC_TRACKERS];
}

export const defaultTrackers: string[] = resolveDefaultTrackers(import.meta.env.VITE_E2E_API_BASE);
