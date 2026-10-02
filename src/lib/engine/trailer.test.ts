import { describe, it, expect, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { openTrailer } from './trailer';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('openTrailer', () => {
  it('asks the backend to open the trailer', async () => {
    await openTrailer('FVI84Dfx2-I');

    expect(invoke).toHaveBeenCalledWith('open_trailer', { youtubeId: 'FVI84Dfx2-I' });
  });
});
