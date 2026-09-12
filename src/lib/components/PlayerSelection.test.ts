import { render, fireEvent, within } from '@testing-library/svelte';
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

  it('shows release type and size as secondary detail text for the selected option', () => {
    const torrents = [
      { hash: 'abc', quality: '1080p', type: 'BluRay', size: '2.1 GB' },
      { hash: 'def', quality: '4K', type: 'web', size: '4.5 GB' }
    ];

    const { getByText } = render(PlayerSelection, {
      props: { torrents, selectedTorrentHash: 'abc', onPlay: vi.fn() }
    });

    expect(getByText(/BluRay/)).toBeInTheDocument();
    expect(getByText(/2\.1 GB/)).toBeInTheDocument();
  });

  it('disambiguates options that share the same quality but differ in release type', () => {
    const torrents = [
      { hash: 'abc', quality: '1080p', type: 'BluRay', size: '2.1 GB' },
      { hash: 'def', quality: '1080p', type: 'WEBRip', size: '1.6 GB' }
    ];

    const { getByRole } = render(PlayerSelection, {
      props: { torrents, selectedTorrentHash: 'abc', onPlay: vi.fn() }
    });

    const select = getByRole('combobox');
    const options = within(select).getAllByRole('option');

    expect(options).toHaveLength(2);
    const labels = options.map((o) => o.textContent?.trim());
    expect(labels[0]).not.toBe(labels[1]);
    expect(labels[0]).toContain('BluRay');
    expect(labels[1]).toContain('WEBRip');
  });

  it('does not add a disambiguator when qualities are unique', () => {
    const torrents = [{ hash: 'abc', quality: '1080p', type: 'BluRay', size: '2.1 GB' }];

    const { getByRole } = render(PlayerSelection, {
      props: { torrents, selectedTorrentHash: 'abc', onPlay: vi.fn() }
    });

    const select = getByRole('combobox');
    const option = within(select).getByRole('option');
    expect(option.textContent?.trim()).toBe('1080p');
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
});
