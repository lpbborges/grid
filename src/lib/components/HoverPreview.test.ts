import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import HoverPreview from './HoverPreview.svelte';
import { hoverPreview, HOVER_DELAY_MS } from '$lib/stores/hoverPreview.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';
import { watchedStore } from '$lib/stores/watched.svelte';
import { playerState } from '$lib/stores.svelte';
import type { PreviewMeta } from '$lib/api/cinemeta';

const { getPreviewMetaMock } = vi.hoisted(() => ({ getPreviewMetaMock: vi.fn() }));

vi.mock('$lib/api/cinemeta', () => ({ getPreviewMeta: getPreviewMetaMock }));

const movie = { id: 'tt1', title: 'Matrix', medium_cover_image: 'poster.jpg' };
const series = { id: 'tt2', title: 'Dark', medium_cover_image: 'dark.jpg' };

async function open(card: HTMLElement, media = movie, type: 'movie' | 'series' = 'movie') {
  hoverPreview.request(card, media, type);
  await vi.advanceTimersByTimeAsync(HOVER_DELAY_MS);
}

describe('HoverPreview', () => {
  let card: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    card = document.createElement('a');
    document.body.append(card);
    settingsStore.hoverPreview = true;
    playerState.isPlaying = false;
    getPreviewMetaMock.mockReset();
  });

  afterEach(() => {
    hoverPreview.close();
    card.remove();
    vi.useRealTimers();
  });

  it('renders nothing while no preview is open', () => {
    render(HoverPreview);

    expect(screen.queryByTestId('hover-preview')).toBeNull();
  });

  it('shows the details of a movie with its play, list and details actions', async () => {
    const meta: PreviewMeta = {
      backdrop: 'bg.jpg',
      runtime: '136 min',
      genres: ['Action', 'Sci-Fi']
    };
    getPreviewMetaMock.mockResolvedValue(meta);
    render(HoverPreview);

    await open(card);

    expect(screen.getByTestId('hover-preview-title').textContent?.trim()).toBe('Matrix');
    expect(screen.getByTestId('hover-preview-facts').textContent?.trim()).toBe('Filme · 2h 16min');
    expect(screen.getByTestId('hover-preview-genres').textContent?.trim()).toBe(
      'Ação · Ficção científica'
    );
    expect(screen.getByTestId('hover-preview-image').getAttribute('src')).toBe('bg.jpg');
    expect(screen.getByTestId('hover-preview-play').getAttribute('href')).toBe('/movie/tt1?play=1');
    expect(screen.getByTestId('hover-preview-details').getAttribute('href')).toBe('/movie/tt1');
    expect(screen.getByLabelText('Adicionar a uma lista')).toBeTruthy();
  });

  it('counts the seasons of a series', async () => {
    getPreviewMetaMock.mockResolvedValue({ seasons: 3 });
    render(HoverPreview);

    await open(card, series, 'series');

    expect(screen.getByTestId('hover-preview-facts').textContent?.trim()).toBe(
      'Série · 3 temporadas'
    );
    expect(screen.getByTestId('hover-preview-play').getAttribute('href')).toBe(
      '/series/tt2?play=1'
    );
  });

  it('still expands with the poster and actions when there are no details', async () => {
    getPreviewMetaMock.mockResolvedValue({});
    render(HoverPreview);

    await open(card);

    expect(screen.getByTestId('hover-preview-image').getAttribute('src')).toBe('poster.jpg');
    expect(screen.getByTestId('hover-preview-facts').textContent?.trim()).toBe('Filme');
    expect(screen.queryByTestId('hover-preview-genres')).toBeNull();
    expect(screen.getByTestId('hover-preview-play')).toBeTruthy();
  });

  it('still expands when the details fail to load', async () => {
    getPreviewMetaMock.mockRejectedValue(new Error('offline'));
    render(HoverPreview);

    await open(card);

    expect(screen.getByTestId('hover-preview-title').textContent?.trim()).toBe('Matrix');
  });

  it('cancels the details request when the preview closes', async () => {
    getPreviewMetaMock.mockReturnValue(new Promise(() => {}));
    render(HoverPreview);
    await open(card);
    const signal: AbortSignal = getPreviewMetaMock.mock.calls[0][2].signal;

    hoverPreview.close();
    await vi.advanceTimersByTimeAsync(0);

    expect(signal.aborted).toBe(true);
  });

  it('ignores details that arrive after the pointer moved to another title', async () => {
    let resolveFirst: (meta: PreviewMeta) => void = () => {};
    getPreviewMetaMock
      .mockReturnValueOnce(new Promise<PreviewMeta>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ runtime: '50 min' });
    render(HoverPreview);
    const other = document.createElement('a');

    await open(card);
    await open(other, series, 'series');
    resolveFirst({ runtime: '999 min', genres: ['Horror'] });
    await vi.advanceTimersByTimeAsync(0);

    expect(screen.getByTestId('hover-preview-facts').textContent?.trim()).toBe('Série · 50min');
    expect(screen.queryByTestId('hover-preview-genres')).toBeNull();
  });

  it('closes on Escape and returns focus to the card when it held focus', async () => {
    getPreviewMetaMock.mockResolvedValue({});
    card.tabIndex = 0;
    render(HoverPreview);
    await open(card);
    screen.getByTestId('hover-preview-play').focus();

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByTestId('hover-preview')).toBeNull();
    expect(document.activeElement).toBe(card);
  });

  it('closes the whole preview on Escape while its list menu is open, leaving the focus on the card', async () => {
    getPreviewMetaMock.mockResolvedValue({});
    card.tabIndex = 0;
    render(HoverPreview);
    await open(card);
    await fireEvent.click(screen.getByLabelText('Adicionar a uma lista'));
    expect(screen.getByRole('group', { name: 'Listas' })).toBeInTheDocument();
    screen.getByRole('checkbox', { name: 'Favoritos' }).focus();

    await fireEvent.keyDown(window, { key: 'Escape' });
    await vi.advanceTimersByTimeAsync(300);

    expect(screen.queryByTestId('hover-preview')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Listas' })).toBeNull();
    expect(document.activeElement).toBe(card);
  });

  it('keeps the preview open when the list menu opens and when a list is ticked', async () => {
    getPreviewMetaMock.mockResolvedValue({});
    render(HoverPreview);
    await open(card);

    await fireEvent.click(screen.getByLabelText('Adicionar a uma lista'));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Favoritos' }));

    expect(screen.getByTestId('hover-preview')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Listas' })).toBeInTheDocument();
  });

  it('hands keyboard focus to the first action', async () => {
    getPreviewMetaMock.mockResolvedValue({});
    render(HoverPreview);
    await open(card);

    expect(hoverPreview.focusActions()).toBe(true);
    expect(document.activeElement).toBe(screen.getByTestId('hover-preview-play'));
  });

  it('offers no remove button for a title outside Continuar assistindo', async () => {
    getPreviewMetaMock.mockResolvedValue({});
    render(HoverPreview);

    await open(card);

    expect(screen.queryByTestId('hover-preview-remove')).toBeNull();
  });

  it('removes the title from Continuar assistindo and closes the preview', async () => {
    getPreviewMetaMock.mockResolvedValue({});
    const onremove = vi.fn();
    render(HoverPreview);
    hoverPreview.request(card, movie, 'movie', { onremove });
    await vi.advanceTimersByTimeAsync(HOVER_DELAY_MS);

    await fireEvent.click(screen.getByRole('button', { name: 'Remover de Continuar assistindo' }));

    expect(onremove).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('hover-preview')).toBeNull();
  });

  it('shows the episode and the watched progress for a title in Continuar assistindo', async () => {
    getPreviewMetaMock.mockResolvedValue({ runtime: '50 min' });
    render(HoverPreview);
    hoverPreview.request(card, series, 'series', {
      progress: { time: 25, duration: 100 },
      episodeLabel: 'T1:E2'
    });
    await vi.advanceTimersByTimeAsync(HOVER_DELAY_MS);

    expect(screen.getByTestId('hover-preview-facts').textContent?.trim()).toBe(
      'Série · T1:E2 · 50min'
    );
    expect(screen.getByTestId('hover-preview-progress').getAttribute('style')).toContain(
      'width: 25%'
    );
  });

  it('marks the next episode', async () => {
    getPreviewMetaMock.mockResolvedValue({});
    render(HoverPreview);
    hoverPreview.request(card, series, 'series', { episodeLabel: 'T1:E3', upNext: true });
    await vi.advanceTimersByTimeAsync(HOVER_DELAY_MS);

    expect(screen.getByTestId('hover-preview-facts').textContent?.trim()).toBe(
      'Série · Próximo: T1:E3'
    );
    expect(screen.queryByTestId('hover-preview-progress')).toBeNull();
  });

  it('links Play to the episode to resume when the card does', async () => {
    getPreviewMetaMock.mockResolvedValue({});
    render(HoverPreview);
    hoverPreview.request(card, series, 'series', { href: '/series/tt2?season=1&episode=11' });
    await vi.advanceTimersByTimeAsync(HOVER_DELAY_MS);

    expect(screen.getByTestId('hover-preview-play').getAttribute('href')).toBe(
      '/series/tt2?season=1&episode=11&play=1'
    );
  });

  it('shows itself once measured, so it never flashes at the wrong place', async () => {
    getPreviewMetaMock.mockResolvedValue({});
    render(HoverPreview);

    await open(card);

    expect(screen.getByTestId('hover-preview').dataset.ready).toBe('true');
  });

  it('keeps the poster where the card was while the backdrop fades in', async () => {
    getPreviewMetaMock.mockResolvedValue({ backdrop: 'bg.jpg' });
    render(HoverPreview);
    await open(card);

    expect(screen.getByTestId('hover-preview-poster').getAttribute('src')).toBe('poster.jpg');
    expect(screen.getByTestId('hover-preview-image').className).toContain('opacity-0');

    await fireEvent.load(screen.getByTestId('hover-preview-image'));

    expect(screen.getByTestId('hover-preview-image').className).toContain('opacity-100');
  });

  it('does not pick an image before the details arrive', async () => {
    getPreviewMetaMock.mockReturnValue(new Promise(() => {}));
    render(HoverPreview);

    await open(card);

    expect(screen.queryByTestId('hover-preview-image')).toBeNull();
  });

  it('uses square buttons with rounded corners', async () => {
    getPreviewMetaMock.mockResolvedValue({});
    render(HoverPreview);
    hoverPreview.request(card, movie, 'movie', { onremove: () => {} });
    await vi.advanceTimersByTimeAsync(HOVER_DELAY_MS);

    for (const button of [
      screen.getByTestId('hover-preview-play'),
      screen.getByTestId('hover-preview-remove'),
      screen.getByTestId('hover-preview-details'),
      screen.getByTestId('hover-preview-watched'),
      screen.getByLabelText('Adicionar a uma lista')
    ]) {
      expect(button.className).toContain('rounded-sm');
      expect(button.className).not.toContain('rounded-full');
    }
  });

  it('marks the title as watched and back', async () => {
    getPreviewMetaMock.mockResolvedValue({});
    watchedStore.watchedIds = [];
    render(HoverPreview);
    await open(card);

    await fireEvent.click(screen.getByRole('button', { name: 'Marcar como assistido' }));
    expect(watchedStore.has(movie.id)).toBe(true);

    const marked = screen.getByRole('button', { name: 'Marcado como assistido' });
    expect(marked.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(marked);

    expect(watchedStore.has(movie.id)).toBe(false);
    expect(screen.getByRole('button', { name: 'Marcar como assistido' })).toBeTruthy();
  });
});
