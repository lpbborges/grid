import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import EpisodeList from './EpisodeList.svelte';
import '@testing-library/jest-dom';

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
    expect(getByText(/1\. Ep 1 Translated/)).toBeInTheDocument();
    expect(getByText(/2\. Ep 2/)).toBeInTheDocument();

    // Season 2 episode should not be visible
    expect(queryByText(/1\. Ep 3/)).not.toBeInTheDocument();

    const playButton = getByText(/1\. Ep 1 Translated/).closest('button');
    await fireEvent.click(playButton!);

    expect(onPlayEpisode).toHaveBeenCalledWith(episodes[0]);
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
});
