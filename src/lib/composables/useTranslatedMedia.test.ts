import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import TranslatedMediaHarness from './__fixtures__/TranslatedMediaHarness.svelte';

const translateMediaInfoMock = vi.fn();

vi.mock('$lib/api/translate', () => ({
  translateMediaInfo: (...args: unknown[]) => translateMediaInfoMock(...args)
}));

describe('useTranslatedMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with original title and synopsis, then updates with translated values', async () => {
    translateMediaInfoMock.mockResolvedValue({
      title: 'Título Traduzido',
      synopsis: 'Sinopse Traduzida'
    });

    render(TranslatedMediaHarness, {
      props: {
        media: {
          id: 'tt123',
          title: 'Original Title',
          description_full: 'Original Synopsis'
        }
      }
    });

    expect(screen.getByTestId('title').textContent).toBe('Original Title');
    expect(screen.getByTestId('synopsis').textContent).toBe('Original Synopsis');

    await waitFor(() => {
      expect(screen.getByTestId('title').textContent).toBe('Título Traduzido');
      expect(screen.getByTestId('synopsis').textContent).toBe('Sinopse Traduzida');
    });
  });

  it('handles empty media gracefully', () => {
    render(TranslatedMediaHarness, {
      props: {
        media: null
      }
    });

    expect(screen.getByTestId('title').textContent).toBe('');
    expect(screen.getByTestId('synopsis').textContent).toBe('');
    expect(translateMediaInfoMock).not.toHaveBeenCalled();
  });

  it('uses default fallback text when synopsis is missing', async () => {
    translateMediaInfoMock.mockResolvedValue({
      title: 'Filme',
      synopsis: 'Nenhuma sinopse disponível.'
    });

    render(TranslatedMediaHarness, {
      props: {
        media: {
          id: 'tt456',
          title: 'Movie Without Synopsis'
        }
      }
    });

    expect(screen.getByTestId('synopsis').textContent).toBe('Nenhuma sinopse disponível.');
  });
});
