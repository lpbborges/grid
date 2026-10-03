import { describe, it, expect } from 'vitest';
import { fileDownloadedBytes, sumFileProgress, totalDownloadedBytes } from './torrentStats';

describe('sumFileProgress', () => {
  it('adds up every file of the torrent', () => {
    expect(sumFileProgress([10, 20, 5])).toBe(35);
    expect(sumFileProgress([])).toBe(0);
  });
});

describe('totalDownloadedBytes', () => {
  it('prefers the per-file progress', () => {
    expect(
      totalDownloadedBytes({
        file_progress: [10, 20],
        live: { snapshot: { downloaded_and_checked_bytes: 99 } }
      })
    ).toBe(30);
  });

  it('falls back to the live snapshot', () => {
    expect(totalDownloadedBytes({ live: { snapshot: { downloaded_and_checked_bytes: 99 } } })).toBe(
      99
    );
  });

  it('is unknown without stats', () => {
    expect(totalDownloadedBytes(null)).toBeUndefined();
    expect(totalDownloadedBytes({})).toBeUndefined();
  });
});

describe('fileDownloadedBytes', () => {
  it('reads the progress of the file asked for', () => {
    expect(fileDownloadedBytes({ file_progress: [10, 20] }, 1)).toBe(20);
  });

  it('falls back to the whole torrent when the file has no progress', () => {
    expect(fileDownloadedBytes({ file_progress: [10, 20] }, 5)).toBe(30);
    expect(fileDownloadedBytes({ file_progress: [10, 20] })).toBe(30);
    expect(
      fileDownloadedBytes({ live: { snapshot: { downloaded_and_checked_bytes: 7 } } }, 0)
    ).toBe(7);
  });
});
