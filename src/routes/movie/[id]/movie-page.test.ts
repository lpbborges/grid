import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MoviePage from './+page.svelte';

const { prepareStreamMock, translateMediaInfoMock, clearTorrentsMock } = vi.hoisted(() => ({
  prepareStreamMock: vi.fn(),
  translateMediaInfoMock: vi.fn(),
  clearTorrentsMock: vi.fn()
}));

vi.mock('$lib/engine/orchestrator', () => ({
  prepareStream: prepareStreamMock
}));

vi.mock('$lib/api/translate', () => ({
  translateMediaInfo: translateMediaInfoMock
}));

vi.mock('$lib/engine/torrent', () => ({
  clearTorrents: clearTorrentsMock
}));

const movie = {
  id: 'tt1',
  title: 'Some Movie',
  year: 2024,
  rating: 8,
  summary: 'Summary',
  description_full: 'Full description',
  medium_cover_image: 'img.jpg',
  large_cover_image: 'img.jpg',
  torrents: [
    { hash: 'abc', quality: '1080p', type: 'web', size: '1GB', seeds: 10, peers: 5, url: 'x' }
  ]
};

describe('Movie page error handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearTorrentsMock.mockResolvedValue(undefined);
    translateMediaInfoMock.mockResolvedValue({ title: movie.title, synopsis: movie.summary });
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  it('shows a friendly message and no raw error text when the load fails', () => {
    const rawMessage = 'TypeError: Failed to fetch at yts.ts:42';

    render(MoviePage, {
      props: { data: { movieId: 'tt1', movie: null, error: rawMessage } }
    });

    expect(screen.queryByText(rawMessage, { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText(/não foi possível carregar este título/i)).toBeInTheDocument();
  });

  it('shows a retry button when the load fails', () => {
    render(MoviePage, {
      props: { data: { movieId: 'tt1', movie: null, error: 'boom' } }
    });

    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it('logs the raw load error to the console for debugging', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rawMessage = 'network down';

    render(MoviePage, {
      props: { data: { movieId: 'tt1', movie: null, error: rawMessage } }
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.anything(), rawMessage);
    consoleErrorSpy.mockRestore();
  });

  it('shows a friendly message and a retry button when playback fails, without leaking the raw exception', async () => {
    prepareStreamMock.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:1234'));

    render(MoviePage, {
      props: { data: { movieId: 'tt1', movie, error: null } }
    });

    const playButton = screen.getByRole('button', { name: /reproduzir/i });
    await fireEvent.click(playButton);
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.queryByText(/ECONNREFUSED/i)).not.toBeInTheDocument();
    expect(screen.getByText(/não foi possível iniciar a reprodução/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });
});
