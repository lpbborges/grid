import { render, screen, act } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { appReady } from '$lib/stores.svelte';

const { pageState } = vi.hoisted(() => ({
  pageState: { url: new URL('http://localhost/') }
}));

vi.mock('$app/state', () => ({ page: pageState }));

import SplashScreen, { SPLASH_MIN_MS, SPLASH_TIMEOUT_MS } from './SplashScreen.svelte';

// jsdom has no Web Animations API, which Svelte transitions run on.
function stubAnimate() {
  return {
    onfinish: null as (() => void) | null,
    cancel() {},
    finished: Promise.resolve(),
    get playState() {
      return 'finished';
    }
  };
}

describe('SplashScreen', () => {
  beforeEach(() => {
    Element.prototype.animate = vi.fn(() => {
      const animation = stubAnimate();
      setTimeout(() => animation.onfinish?.());
      return animation;
    }) as unknown as Element['animate'];
    vi.useFakeTimers();
    appReady.value = false;
    pageState.url = new URL('http://localhost/');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.getElementById('boot-splash')?.remove();
  });

  it('shows the animated logo until the app is ready', async () => {
    render(SplashScreen);

    const logo = screen.getByRole('img', { name: 'Grid Logo' });
    expect(screen.getByTestId('logo-scanlines')).toHaveClass('motion-safe:animate-logo-scan');

    await act(() => {
      appReady.value = true;
    });
    await vi.runAllTimersAsync();

    expect(logo).not.toBeInTheDocument();
  });

  it('stays up for a minimum time even when the app is ready right away', async () => {
    appReady.value = true;
    render(SplashScreen);

    await vi.advanceTimersByTimeAsync(SPLASH_MIN_MS - 1);
    const logo = screen.getByRole('img', { name: 'Grid Logo' });

    await vi.advanceTimersByTimeAsync(1);
    await vi.runAllTimersAsync();
    expect(logo).not.toBeInTheDocument();
  });

  it('draws the grid backdrop behind the logo', () => {
    render(SplashScreen);

    expect(screen.getByTestId('splash-grid')).toHaveClass('bg-grid');
  });

  it('gives up waiting after the timeout', async () => {
    render(SplashScreen);

    await vi.advanceTimersByTimeAsync(SPLASH_TIMEOUT_MS - 1);
    expect(appReady.value).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(appReady.value).toBe(true);
  });

  it('does not wait for the catalog when the app starts on another route', async () => {
    pageState.url = new URL('http://localhost/movie/tt1');

    render(SplashScreen);
    await act(async () => {});

    expect(appReady.value).toBe(true);
  });

  it('replaces the pre-boot splash from app.html', async () => {
    const bootSplash = document.createElement('div');
    bootSplash.id = 'boot-splash';
    document.body.append(bootSplash);

    render(SplashScreen);
    await act(async () => {});

    expect(document.getElementById('boot-splash')).toBeNull();
  });
});
