import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import UpNextHarness from './__fixtures__/UpNextHarness.svelte';
import { createUpNextSource } from './__fixtures__/upNextSource.svelte';
import type { useUpNext } from './useUpNext.svelte';

type Source = ReturnType<typeof createUpNextSource>;

function mount(initial: Parameters<typeof createUpNextSource>[0] = {}) {
  const source: Source = createUpNextSource(initial);
  const onadvance = vi.fn();
  let upNext!: ReturnType<typeof useUpNext>;
  render(UpNextHarness, {
    props: {
      source,
      onadvance,
      onReady: (u) => {
        upNext = u;
      }
    }
  });
  return { source, onadvance, upNext };
}

describe('useUpNext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays hidden before the last 30 seconds', async () => {
    const { upNext } = mount({ currentTime: 2600 });
    await tick();

    expect(upNext.visible).toBe(false);
    expect(upNext.armed()).toBe(false);
  });

  it('shows the card in the last 30 seconds when there is a next episode', async () => {
    const { upNext } = mount({ currentTime: 2675 });
    await tick();

    expect(upNext.visible).toBe(true);
    expect(upNext.secondsLeft).toBe(10);
    expect(upNext.armed()).toBe(true);
  });

  it('never shows the card without a next episode', async () => {
    const { upNext, onadvance } = mount({ currentTime: 2690, hasNext: false });
    await tick();
    vi.advanceTimersByTime(20_000);

    expect(upNext.visible).toBe(false);
    expect(upNext.armed()).toBe(false);
    expect(onadvance).not.toHaveBeenCalled();
  });

  it('never shows the card while nothing plays', async () => {
    const { upNext } = mount({ key: '', currentTime: 2690 });
    await tick();

    expect(upNext.visible).toBe(false);
  });

  it('starts the next episode when the countdown runs out', async () => {
    const { upNext, onadvance } = mount({ currentTime: 2675 });
    await tick();

    vi.advanceTimersByTime(9_000);
    await tick();
    expect(upNext.secondsLeft).toBe(1);
    expect(onadvance).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    await tick();
    expect(onadvance).toHaveBeenCalledTimes(1);
    expect(upNext.visible).toBe(false);
  });

  it('counts down while the clock moves', async () => {
    const { source, upNext } = mount({ currentTime: 2675 });
    await tick();

    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(250);
      source.currentTime += 0.25;
      await tick();
    }

    expect(upNext.secondsLeft).toBe(7);
  });

  it('holds the countdown while the video is paused', async () => {
    const { source, upNext, onadvance } = mount({ currentTime: 2675 });
    await tick();
    vi.advanceTimersByTime(2_000);
    source.paused = true;
    await tick();

    vi.advanceTimersByTime(20_000);
    await tick();

    expect(onadvance).not.toHaveBeenCalled();
    expect(upNext.secondsLeft).toBe(8);
    expect(upNext.visible).toBe(true);
  });

  it('starts at once on playNow and only once', async () => {
    const { upNext, onadvance } = mount({ currentTime: 2675 });
    await tick();

    upNext.playNow();
    upNext.playNow();
    await tick();
    vi.advanceTimersByTime(20_000);

    expect(onadvance).toHaveBeenCalledTimes(1);
    expect(upNext.visible).toBe(false);
  });

  it('stays hidden for the episode after cancel', async () => {
    const { source, upNext, onadvance } = mount({ currentTime: 2690 });
    await tick();

    upNext.cancel();
    await tick();
    expect(upNext.visible).toBe(false);

    source.currentTime = 2600;
    await tick();
    source.currentTime = 2690;
    await tick();
    vi.advanceTimersByTime(20_000);

    expect(upNext.visible).toBe(false);
    expect(upNext.armed()).toBe(false);
    expect(onadvance).not.toHaveBeenCalled();
  });

  it('hides and resets when the viewer seeks back out of the credits', async () => {
    const { source, upNext } = mount({ currentTime: 2690 });
    await tick();
    vi.advanceTimersByTime(4_000);
    await tick();
    expect(upNext.secondsLeft).toBe(6);

    source.currentTime = 2000;
    await tick();
    expect(upNext.visible).toBe(false);
    expect(upNext.armed()).toBe(false);

    source.currentTime = 2690;
    await tick();
    expect(upNext.visible).toBe(true);
    expect(upNext.secondsLeft).toBe(10);
  });

  it('shows the card again for the next file after a cancel', async () => {
    const { source, upNext } = mount({ currentTime: 2690 });
    await tick();
    upNext.cancel();
    await tick();

    source.key = 'T1:E2';
    source.currentTime = 0;
    await tick();
    source.currentTime = 2690;
    await tick();

    expect(upNext.visible).toBe(true);
  });

  it('stays armed after the clock resets at the end of the file', async () => {
    const { source, upNext } = mount({ currentTime: 2690 });
    await tick();

    source.currentTime = 0;
    source.duration = 0;
    expect(upNext.armed()).toBe(true);

    await tick();
    expect(upNext.armed()).toBe(true);
  });
});
