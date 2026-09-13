import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import PlayerSelection from './PlayerSelection.svelte';
import '@testing-library/jest-dom';

describe('PlayerSelection component', () => {
  it('shows only the quality as the primary option label', () => {
    const torrents = [{ hash: 'abc', quality: '1080p', type: 'web', size: '1GB' }];

    const { getByText, queryByText } = render(PlayerSelection, {
      props: { torrents, selectedTorrentHash: 'abc', onPlay: vi.fn() }
    });

    expect(getByText('1080p')).toBeInTheDocument();
    expect(queryByText('1080p - web (1GB)')).not.toBeInTheDocument();
  });

  it('calls onPlay when the play button is clicked', async () => {
    const onPlay = vi.fn();
    const torrents = [{ hash: 'abc', quality: '1080p', type: 'web', size: '1GB' }];

    const { getByRole } = render(PlayerSelection, {
      props: { torrents, selectedTorrentHash: 'abc', onPlay }
    });

    const button = getByRole('button', { name: /reproduzir/i });
    await fireEvent.click(button);

    expect(onPlay).toHaveBeenCalled();
  });

  it('shows an empty state when there are no torrents', () => {
    const { getByText } = render(PlayerSelection, {
      props: { torrents: [], selectedTorrentHash: '', onPlay: vi.fn() }
    });

    expect(getByText('Nenhuma opção de reprodução disponível')).toBeInTheDocument();
  });

  it('renders the "Original" audio option in the same format as EpisodeList (via the shared PreferenceSelectors)', () => {
    const torrents = [{ hash: 'abc', quality: '1080p', type: 'web', size: '1GB' }];

    const { getByText } = render(PlayerSelection, {
      props: { torrents, selectedTorrentHash: 'abc', onPlay: vi.fn(), originalLanguage: 'en' }
    });

    expect(getByText('Original (Inglês)')).toBeInTheDocument();
  });
});
