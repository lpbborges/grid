import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import EpisodeList from './EpisodeList.svelte';
import '@testing-library/jest-dom';
import { progressStore } from '$lib/stores/progress.svelte';

describe('EpisodeList component', () => {
  it('renders episodes and handles play action', async () => {
    const onPlayEpisode = vi.fn();
    const episodes = [
      { id: '1', season: 1, episode: 1, name: 'Ep 1', firstAired: '2023-01-01' },
      { id: '2', season: 1, episode: 2, name: 'Ep 2', firstAired: '2023-01-08' },
      { id: '3', season: 2, episode: 1, name: 'Ep 3' }
    ];
    const translatedEpisodes = { '1': 'Ep 1 Translated' };

    const { getByText, queryByText } = render(EpisodeList, {
      props: {
        seriesId: 'series-123',
        episodes,
        translatedEpisodes,
        selectedSeason: 1,

        onPlayEpisode
      }
    });

    expect(getByText('Episódios')).toBeInTheDocument();
    expect(getByText('Temporada 1')).toBeInTheDocument();
    expect(getByText(/1\. Ep 1 Translated/)).toBeInTheDocument();
    expect(getByText(/2\. Ep 2/)).toBeInTheDocument();

    expect(queryByText(/1\. Ep 3/)).not.toBeInTheDocument();

    const playButton = getByText(/1\. Ep 1 Translated/).closest('button');
    await fireEvent.click(playButton!);

    expect(onPlayEpisode).toHaveBeenCalledWith(episodes[0]);
  });

  it('offers to continue an episode with saved progress or to start it over', async () => {
    progressStore.progress = {
      'series-123-S1E2': { time: 750, duration: 2400, updatedAt: 1 },
      'series-123-S1E1': { time: 30, duration: 2400, updatedAt: 1 }
    };
    const onPlayEpisode = vi.fn();
    const episodes = [
      { id: '1', season: 1, episode: 1, name: 'Ep 1' },
      { id: '2', season: 1, episode: 2, name: 'Ep 2' }
    ];
    const { getByText, getAllByRole } = render(EpisodeList, {
      props: {
        seriesId: 'series-123',
        episodes,
        translatedEpisodes: {},
        selectedSeason: 1,
        onPlayEpisode
      }
    });

    expect(getByText('Continuar de 12:30')).toBeInTheDocument();
    const restarts = getAllByRole('button', { name: 'Começar do início' });
    expect(restarts).toHaveLength(1);

    await fireEvent.click(restarts[0]);
    expect(onPlayEpisode).toHaveBeenCalledWith(episodes[1], true);
    progressStore.progress = {};
  });

  it('shows an empty state when there are no episodes', () => {
    const { getByText } = render(EpisodeList, {
      props: {
        seriesId: 'series-123',
        episodes: [],
        translatedEpisodes: {},
        selectedSeason: null,

        onPlayEpisode: vi.fn()
      }
    });

    expect(getByText('Nenhuma opção de reprodução disponível')).toBeInTheDocument();
  });

  it('renders the "Original" audio option in the same format as PlayerSelection (via the shared PreferenceSelectors)', () => {
    const episodes = [{ id: '1', season: 1, episode: 1, name: 'Ep 1' }];

    const { getByText } = render(EpisodeList, {
      props: {
        seriesId: 'series-123',
        episodes,
        translatedEpisodes: {},
        selectedSeason: 1,
        onPlayEpisode: vi.fn(),
        originalLanguage: 'en'
      }
    });

    expect(getByText('Original (Inglês)')).toBeInTheDocument();
  });

  describe('focused episode', () => {
    const episodes = [
      { id: '1', season: 1, episode: 1, name: 'Ep 1' },
      { id: '2', season: 1, episode: 2, name: 'Ep 2' },
      { id: '3', season: 2, episode: 1, name: 'Ep 3' }
    ];
    let scrollTo: MockInstance<HTMLElement['scrollTo']>;
    let scrollIntoView: MockInstance<HTMLElement['scrollIntoView']>;

    beforeEach(() => {
      scrollTo = vi.spyOn(HTMLElement.prototype, 'scrollTo');
      scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function renderFocused(focusEpisode: { season: number; episode: number } | null) {
      return render(EpisodeList, {
        props: {
          seriesId: 'series-123',
          episodes,
          translatedEpisodes: {},
          selectedSeason: 1,
          onPlayEpisode: vi.fn(),
          focusEpisode
        }
      });
    }

    it('highlights only the focused episode and labels it', () => {
      const { container } = renderFocused({ season: 1, episode: 2 });

      const focused = container.querySelector('[data-episode="2"]')!;
      expect(focused.getAttribute('aria-current')).toBe('true');
      expect(container.querySelector('[data-episode="1"]')!.hasAttribute('aria-current')).toBe(
        false
      );
      expect(focused.querySelector('button')!.textContent).toContain('Continuar');
      expect(container.querySelector('[data-episode="1"]')!.textContent).not.toContain('Continuar');
    });

    it('scrolls the focused episode into view once, inside the list only', async () => {
      const { container, rerender } = renderFocused({ season: 1, episode: 2 });

      await rerender({ translatedEpisodes: { '1': 'Translated' } });

      const row = container.querySelector('[data-episode="2"]')!;
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo.mock.contexts[0]).toBe(row.parentElement);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('scrolls again when another series opens on the same episode', async () => {
      const { rerender } = renderFocused({ season: 1, episode: 2 });

      await rerender({
        seriesId: 'series-456',
        episodes: episodes.map((episode) => ({ ...episode, id: `other-${episode.id}` })),
        focusEpisode: { season: 1, episode: 2 }
      });

      expect(scrollTo).toHaveBeenCalledTimes(2);
    });

    it('scrolls to the focused episode again when its season is shown again', async () => {
      const { container } = renderFocused({ season: 1, episode: 2 });
      const seasons = container.querySelector('select')!;

      await fireEvent.change(seasons, { target: { value: '2' } });
      await fireEvent.change(seasons, { target: { value: '1' } });

      expect(scrollTo).toHaveBeenCalledTimes(2);
    });

    it('does not scroll without a focused episode in the selected season', () => {
      renderFocused({ season: 2, episode: 1 });
      renderFocused(null);

      expect(scrollTo).not.toHaveBeenCalled();
    });
  });
});
