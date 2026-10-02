import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRawSnippet } from 'svelte';
import { searchQuery } from '$lib/stores.svelte';

const { pageState } = vi.hoisted(() => ({
  pageState: { url: new URL('http://localhost/') }
}));

vi.mock('$app/state', () => ({ page: pageState }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isMaximized: vi.fn().mockResolvedValue(false),
    onResized: vi.fn().mockResolvedValue(vi.fn())
  })
}));

import Layout from './+layout.svelte';

const children = createRawSnippet(() => ({ render: () => '<div></div>' }));

describe('Layout', () => {
  beforeEach(() => {
    searchQuery.value = '';
  });

  it('clears the search when the logo is clicked', async () => {
    searchQuery.value = 'matrix';
    render(Layout, { children });

    await fireEvent.click(screen.getByRole('link', { name: 'Início' }));

    expect(searchQuery.value).toBe('');
  });

  it('links to the settings from the header', () => {
    render(Layout, { children });

    expect(screen.getByRole('link', { name: 'Configurações' }).getAttribute('href')).toBe(
      '/settings'
    );
  });
});
