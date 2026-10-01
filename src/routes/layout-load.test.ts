import { describe, it, expect, vi } from 'vitest';
import { load } from './+layout';

const { backfillMock } = vi.hoisted(() => ({ backfillMock: vi.fn() }));
vi.mock('$lib/engine/progressSnapshots', () => ({ backfillProgressSnapshots: backfillMock }));

describe('root layout load', () => {
  it('starts filling in progress saved without a title', async () => {
    const fetch = vi.fn();

    await load({ fetch } as any);

    expect(backfillMock).toHaveBeenCalledWith(fetch);
  });
});
