import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Titlebar from './Titlebar.svelte';
import { playerState } from '$lib/stores.svelte';

const mockWindow = {
  isMaximized: vi.fn().mockResolvedValue(false),
  onResized: vi.fn().mockResolvedValue(vi.fn()),
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn()
};

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => mockWindow
}));

describe('Titlebar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playerState.isPlaying = false;
  });

  it('renders when player is not playing', () => {
    render(Titlebar);
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy();
  });

  it('does not render when player is playing', () => {
    playerState.isPlaying = true;
    render(Titlebar);
    expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull();
  });

  it('calls minimize when minimize button is clicked', async () => {
    render(Titlebar);
    const btn = screen.getByRole('button', { name: 'Minimizar' });
    await fireEvent.click(btn);
    expect(mockWindow.minimize).toHaveBeenCalled();
  });

  it('calls toggleMaximize when maximize button is clicked', async () => {
    render(Titlebar);
    const btn = screen.getByRole('button', { name: 'Maximizar' });
    await fireEvent.click(btn);
    expect(mockWindow.toggleMaximize).toHaveBeenCalled();
  });

  it('calls close when close button is clicked', async () => {
    render(Titlebar);
    const btn = screen.getByRole('button', { name: 'Fechar' });
    await fireEvent.click(btn);
    expect(mockWindow.close).toHaveBeenCalled();
  });

  it('applies focus-visible ring styling to window control buttons', () => {
    render(Titlebar);
    for (const name of ['Minimizar', 'Maximizar', 'Fechar']) {
      const btn = screen.getByRole('button', { name });
      expect(btn.className).toContain('focus-visible:ring-2');
      expect(btn.className).toContain('focus-visible:ring-accent-green');
    }
  });
});
