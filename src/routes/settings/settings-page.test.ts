import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SettingsPage from './+page.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';
import { BYTES_PER_GB } from '$lib/utils/formatBytes';
import { version } from '../../../package.json';

const { getCacheUsageBytesMock, clearDownloadedVideosMock } = vi.hoisted(() => ({
  getCacheUsageBytesMock: vi.fn(),
  clearDownloadedVideosMock: vi.fn()
}));

vi.mock('$lib/engine/orchestrator', () => ({ clearDownloadedVideos: clearDownloadedVideosMock }));

vi.mock('$lib/engine/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/engine/cache')>()),
  getCacheUsageBytes: getCacheUsageBytesMock
}));

describe('Settings page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getCacheUsageBytesMock.mockResolvedValue(0);
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

  it('clears the downloaded videos after the user confirms', async () => {
    clearDownloadedVideosMock.mockResolvedValue(undefined);
    render(SettingsPage, { data: { cacheUsageBytes: 2.14 * BYTES_PER_GB } });

    await fireEvent.click(screen.getByRole('button', { name: 'Limpar vídeos baixados (2,1 GB)' }));
    expect(clearDownloadedVideosMock).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));

    expect(clearDownloadedVideosMock).toHaveBeenCalledOnce();
    expect(await screen.findByText('0 GB em uso')).toBeTruthy();
  });

  it('keeps the videos when the user cancels', async () => {
    render(SettingsPage, { data: { cacheUsageBytes: BYTES_PER_GB } });

    await fireEvent.click(screen.getByRole('button', { name: /Limpar vídeos baixados/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(clearDownloadedVideosMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Limpar vídeos baixados/ })).toBeTruthy();
  });

  it('says when clearing failed', async () => {
    clearDownloadedVideosMock.mockRejectedValue(new Error('disk'));
    render(SettingsPage, { data: { cacheUsageBytes: BYTES_PER_GB } });

    await fireEvent.click(screen.getByRole('button', { name: /Limpar vídeos baixados/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));

    expect(await screen.findByText('Não foi possível apagar os vídeos.')).toBeTruthy();
  });

  it('has nothing to clear when no video is stored', () => {
    render(SettingsPage, { data: { cacheUsageBytes: 0 } });

    expect(
      (screen.getByRole('button', { name: /Limpar vídeos baixados/ }) as HTMLButtonElement).disabled
    ).toBe(true);
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
