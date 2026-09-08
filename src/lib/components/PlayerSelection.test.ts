import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import PlayerSelection from './PlayerSelection.svelte';
import '@testing-library/jest-dom';

describe('PlayerSelection component', () => {
  it('renders torrents and calls onPlay', async () => {
    const onPlay = vi.fn();
    const torrents = [{ hash: 'abc', quality: '1080p', type: 'web', size: '1GB' }];

    const { getByText, getByRole } = render(PlayerSelection, {
      props: { torrents, selectedTorrentHash: 'abc', onPlay }
    });

    expect(getByText('1080p - web (1GB)')).toBeInTheDocument();

    const button = getByRole('button', { name: /reproduzir/i });
    await fireEvent.click(button);

    expect(onPlay).toHaveBeenCalled();
  });
});
