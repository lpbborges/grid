import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SettingsPage from './+page.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';
import { BYTES_PER_GB } from '$lib/utils/formatBytes';
import { version } from '../../../package.json';

const { getCacheUsageBytesMock } = vi.hoisted(() => ({ getCacheUsageBytesMock: vi.fn() }));

vi.mock('$lib/engine/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/engine/cache')>()),
  getCacheUsageBytes: getCacheUsageBytesMock
}));

describe('Settings page', () => {
  beforeEach(() => {
    localStorage.clear();
    settingsStore.quality = '1080p';
    settingsStore.subtitle = 'pt';
    settingsStore.cacheLimitBytes = 3 * BYTES_PER_GB;
  });

  it('saves the default quality and subtitles for the next playback', async () => {
    render(SettingsPage, { data: { cacheUsageBytes: 0 } });

    await fireEvent.change(screen.getByLabelText('Qualidade'), { target: { value: '720p' } });
    await fireEvent.change(screen.getByLabelText('Legenda'), { target: { value: 'en' } });

    expect(settingsStore.quality).toBe('720p');
    expect(settingsStore.subtitle).toBe('en');
    expect(localStorage.getItem('grid-quality')).toBe('720p');
  });

  it('changes the storage limit in whole gigabytes', async () => {
    render(SettingsPage, { data: { cacheUsageBytes: 0 } });
    const slider = screen.getByLabelText('Limite de armazenamento');

    expect(slider.getAttribute('max')).toBe('50');
    await fireEvent.input(slider, { target: { value: '10' } });

    expect(settingsStore.cacheLimitBytes).toBe(10 * BYTES_PER_GB);
    expect(screen.getByText('10 GB')).toBeTruthy();
  });

  it('shows how much the downloaded videos take', () => {
    render(SettingsPage, { data: { cacheUsageBytes: 2.14 * BYTES_PER_GB } });

    expect(screen.getByText('2,1 GB em uso')).toBeTruthy();
  });

  it('says when the usage could not be read', () => {
    render(SettingsPage, { data: { cacheUsageBytes: null } });

    expect(screen.getByText('Uso indisponível')).toBeTruthy();
  });

  it('shows the app version', () => {
    render(SettingsPage, { data: { cacheUsageBytes: 0 } });

    expect(screen.getByText(`Versão ${version}`)).toBeTruthy();
  });
});

describe('Settings page load', () => {
  it('reads the usage from the backend', async () => {
    getCacheUsageBytesMock.mockResolvedValue(42);
    const { load } = await import('./+page');

    expect(await load({} as never)).toEqual({ cacheUsageBytes: 42 });
  });

  it('degrades to unknown usage when the backend fails', async () => {
    getCacheUsageBytesMock.mockRejectedValue(new Error('no backend'));
    const { load } = await import('./+page');

    expect(await load({} as never)).toEqual({ cacheUsageBytes: null });
  });
});
