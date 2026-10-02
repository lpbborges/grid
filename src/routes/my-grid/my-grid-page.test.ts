import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/svelte';
import MyGridPage from './+page.svelte';
import { favoritesStore } from '$lib/stores/favorites.svelte';
import { progressStore } from '$lib/stores/progress.svelte';

const meta = { type: 'movie' as const, title: 'Filme', poster: 'm.jpg' };

describe('My Grid page', () => {
  beforeEach(() => {
    favoritesStore.entries = [];
    progressStore.progress = {};
  });

  it('is titled Meu Grid', () => {
    render(MyGridPage);

    expect(screen.getByRole('heading', { level: 1, name: 'Meu Grid' })).toBeInTheDocument();
  });

  it('shows one empty state when there is nothing to continue or favorite', () => {
    render(MyGridPage);

    expect(screen.getByText('Seu espaço ainda está vazio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explorar títulos' })).toHaveAttribute('href', '/');
    expect(screen.queryByText('Continuar assistindo')).toBeNull();
    expect(screen.queryByText('Meus favoritos')).toBeNull();
  });

  it('shows only the favorites when nothing is in progress', () => {
    favoritesStore.entries = [{ id: 'tt1', meta }];

    render(MyGridPage);

    expect(screen.getByText('Meus favoritos')).toBeInTheDocument();
    expect(screen.queryByText('Continuar assistindo')).toBeNull();
    expect(screen.queryByText('Seu espaço ainda está vazio')).toBeNull();
  });

  it('shows only Continuar assistindo when there are no favorites', () => {
    progressStore.progress = { tt2: { time: 60, duration: 600, updatedAt: 1, meta } };

    render(MyGridPage);

    expect(screen.getByText('Continuar assistindo')).toBeInTheDocument();
    expect(screen.queryByText('Meus favoritos')).toBeNull();
    expect(screen.queryByText('Seu espaço ainda está vazio')).toBeNull();
  });

  it('shows both rows, and updates when a favorite is added', async () => {
    progressStore.progress = { tt2: { time: 60, duration: 600, updatedAt: 1, meta } };
    render(MyGridPage);
    expect(screen.queryByText('Meus favoritos')).toBeNull();

    await act(() => favoritesStore.add('tt1', meta));

    expect(screen.getByText('Continuar assistindo')).toBeInTheDocument();
    expect(screen.getByText('Meus favoritos')).toBeInTheDocument();
  });
});
