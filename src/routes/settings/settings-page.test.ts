import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SettingsPage from './+page.svelte';
import { axe } from 'vitest-axe';
import { tick } from 'svelte';
import { SUBTITLE_SCALE_STEPS, settingsStore } from '$lib/stores/settings.svelte';
import { BYTES_PER_GB } from '$lib/utils/formatBytes';
import { version } from '../../../package.json';

const { getCacheUsageBytesMock, clearDownloadedVideosMock, gotoMock, navigation } = vi.hoisted(
  () => ({
    getCacheUsageBytesMock: vi.fn(),
    clearDownloadedVideosMock: vi.fn(),
    gotoMock: vi.fn(),
    navigation: { callbacks: [] as ((nav: { from: unknown }) => void)[] }
  })
);

vi.mock('$app/navigation', () => ({
  goto: gotoMock,
  afterNavigate: (callback: (nav: { from: unknown }) => void) => {
    navigation.callbacks.push(callback);
  }
}));

vi.mock('$lib/engine/orchestrator', () => ({ clearDownloadedVideos: clearDownloadedVideosMock }));

vi.mock('$lib/engine/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/engine/cache')>()),
  getCacheUsageBytes: getCacheUsageBytesMock
}));

describe('Settings page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    navigation.callbacks = [];
    getCacheUsageBytesMock.mockResolvedValue(0);
    localStorage.clear();
    settingsStore.quality = '1080p';
    settingsStore.subtitle = 'pt';
    settingsStore.cacheLimitBytes = 3 * BYTES_PER_GB;
    settingsStore.subtitleScale = 100;
  });

  it('titles the page with a slim bar instead of the catalog header', () => {
    render(SettingsPage, { data: { cacheUsageBytes: 0 } });

    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeTruthy();
  });

  it('puts the back button on its own row above the title', () => {
    render(SettingsPage, { data: { cacheUsageBytes: 0 } });
    const back = screen.getByRole('button', { name: 'Voltar' });
    const title = screen.getByRole('heading', { level: 1, name: 'Configurações' });

    expect(back.parentElement).toBe(title.parentElement);
    expect(back.parentElement?.classList.contains('flex-col')).toBe(true);
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(SettingsPage, { data: { cacheUsageBytes: 0 } });

    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the current subtitle size on a slider with the same steps as the player', () => {
    settingsStore.subtitleScale = 125;
    render(SettingsPage, { data: { cacheUsageBytes: 0 } });
    const slider = screen.getByLabelText('Tamanho da legenda') as HTMLInputElement;

    expect(slider.type).toBe('range');
    expect(slider.min).toBe('0');
    expect(slider.max).toBe(String(SUBTITLE_SCALE_STEPS.length - 1));
    expect(slider.value).toBe('2');
    expect(slider.getAttribute('aria-valuetext')).toBe('125%');
  });

  it('saves the subtitle size in the shared settings', async () => {
    render(SettingsPage, { data: { cacheUsageBytes: 0 } });

    await fireEvent.input(screen.getByLabelText('Tamanho da legenda'), { target: { value: '3' } });

    expect(settingsStore.subtitleScale).toBe(150);
    expect(localStorage.getItem('grid-subtitle-scale')).toBe('150');
  });

  it('follows a size changed elsewhere, such as the player menu', async () => {
    render(SettingsPage, { data: { cacheUsageBytes: 0 } });

    settingsStore.subtitleScale = 75;
    await tick();

    expect((screen.getByLabelText('Tamanho da legenda') as HTMLInputElement).value).toBe('0');
  });

  it('previews the subtitle at the selected size, hidden from assistive technology', async () => {
    settingsStore.subtitleScale = 150;
    render(SettingsPage, { data: { cacheUsageBytes: 0 } });
    const preview = screen.getByTestId('subtitle-preview');

    expect(preview.getAttribute('aria-hidden')).toBe('true');
    expect(preview.textContent?.trim()).toBeTruthy();
    expect(preview.style.getPropertyValue('--subtitle-scale')).toBe('1.5');
  });

  it('updates the preview when the size changes', async () => {
    render(SettingsPage, { data: { cacheUsageBytes: 0 } });

    await fireEvent.input(screen.getByLabelText('Tamanho da legenda'), { target: { value: '0' } });

    expect(screen.getByTestId('subtitle-preview').style.getPropertyValue('--subtitle-scale')).toBe(
      '0.75'
    );
  });

  it('goes back to the previous page when there is one', async () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});
    render(SettingsPage, { data: { cacheUsageBytes: 0 } });
    navigation.callbacks.forEach((callback) => callback({ from: { url: new URL('http://x/') } }));

    await fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(back).toHaveBeenCalledOnce();
    expect(gotoMock).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('falls back to the home page when it was the first page opened', async () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});
    render(SettingsPage, { data: { cacheUsageBytes: 0 } });
    navigation.callbacks.forEach((callback) => callback({ from: null }));

    await fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(gotoMock).toHaveBeenCalledWith('/');
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
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
