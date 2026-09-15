import postTorrents from '../../../../tests/fixtures/rqbit/post-torrents.json';
import statsV1 from '../../../../tests/fixtures/rqbit/stats-v1.json';
import stats from '../../../../tests/fixtures/rqbit/stats.json';
import torrents from '../../../../tests/fixtures/rqbit/torrents.json';
import updateOnlyFiles from '../../../../tests/fixtures/rqbit/update-only-files.json';

export interface FakeTorrentFile {
  name: string;
  length: number;
}

export interface FakeRqbitOptions {
  files: FakeTorrentFile[];
  failAdd?: boolean;
  stallAdds?: number;
}

export interface FakeRqbitRequest {
  method: string;
  path: string;
  search: URLSearchParams;
  body: string;
}

export interface FakeRqbit {
  handle(url: URL, init?: RequestInit): Promise<Response>;
  requests: FakeRqbitRequest[];
  loaded: Set<string>;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function createFakeRqbit({
  files,
  failAdd = false,
  stallAdds = 0
}: FakeRqbitOptions): FakeRqbit {
  const requests: FakeRqbitRequest[] = [];
  const loaded = new Set<string>();
  let addsToStall = stallAdds;
  const totalBytes = files.reduce((sum, file) => sum + file.length, 0);
  const fileTemplate = postTorrents.details.files[0];

  function details(infoHash: string) {
    return {
      ...postTorrents.details,
      info_hash: infoHash,
      files: files.map((file) => ({
        ...fileTemplate,
        name: file.name,
        components: [file.name],
        length: file.length
      }))
    };
  }

  async function handle(url: URL, init: RequestInit = {}): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? init.body : '';
    requests.push({ method, path: url.pathname, search: url.searchParams, body });

    const [root, infoHash, action, version] = url.pathname.split('/').filter(Boolean);
    if (root !== 'torrents') return new Response('not found', { status: 404 });

    if (!infoHash && method === 'GET') {
      return json({
        torrents: [...loaded].map((hash) => ({ ...torrents.torrents[0], info_hash: hash }))
      });
    }
    if (!infoHash && method === 'POST') {
      if (addsToStall > 0) {
        addsToStall--;
        return new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        });
      }
      if (failAdd) return new Response('engine failure', { status: 500 });
      const hash = body.match(/btih:([a-f0-9]{40})/i)?.[1].toLowerCase();
      if (!hash) return new Response('invalid magnet', { status: 400 });
      loaded.add(hash);
      return json({ ...postTorrents, details: details(hash) });
    }
    if (action === 'stats' && version === 'v1') {
      return json({
        ...statsV1,
        state: 'live',
        finished: true,
        progress_bytes: totalBytes,
        total_bytes: totalBytes
      });
    }
    if (action === 'stats') {
      return json({
        ...stats,
        snapshot: { ...stats.snapshot, downloaded_and_checked_bytes: totalBytes }
      });
    }
    if (action === 'update_only_files' && method === 'POST') return json(updateOnlyFiles);
    if ((action === 'forget' || action === 'delete') && method === 'POST') {
      loaded.delete(infoHash);
      return json({});
    }
    return new Response('not found', { status: 404 });
  }

  return { handle, requests, loaded };
}
