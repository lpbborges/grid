const fs = require('fs');

let code = fs.readFileSync('src/lib/engine/torrent.test.ts', 'utf-8');

const importTarget = `  waitForEngine,\n  getTorrentSubtitles\n} from './torrent';`;
code = code.replace(
  importTarget,
  `  waitForEngine,\n  clearTorrents,\n  getTorrentSubtitles\n} from './torrent';`
);

const testTarget = `  it('adds a torrent successfully', async () => {`;
const newTest = `  it('clears torrents successfully', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          torrents: [{ info_hash: '123' }, { info_hash: '456' }]
        })
      })
      .mockResolvedValue({ ok: true });

    await clearTorrents();
    expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:3030/torrents');
    expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:3030/torrents/123/delete', { method: 'POST' });
    expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:3030/torrents/456/delete', { method: 'POST' });
  });

  it('adds a torrent successfully', async () => {`;
code = code.replace(testTarget, newTest);

fs.writeFileSync('src/lib/engine/torrent.test.ts', code);
