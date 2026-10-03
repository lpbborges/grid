import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { axe } from 'vitest-axe';
import AudioMenu from './AudioMenu.svelte';

const tracks = [
  { index: 0, id: 'a0', label: 'Inglês', enabled: true },
  { index: 1, id: 'a1', label: 'Português', enabled: false }
];

function renderMenu(props: Partial<Parameters<typeof render<typeof AudioMenu>>[1]> = {}) {
  const ontoggle = vi.fn();
  const onselect = vi.fn();
  const view = render(AudioMenu, {
    audioTracks: tracks,
    activeAudioIndex: 0,
    showAudioMenu: false,
    ontoggle,
    onselect,
    ...props
  });
  return { ontoggle, onselect, ...view };
}

describe('AudioMenu', () => {
  it('renders nothing with fewer than two tracks', () => {
    renderMenu({ audioTracks: [tracks[0]] });

    expect(screen.queryByLabelText('Menu de Faixas de Áudio')).toBeNull();
  });

  it('leaves opening to the parent: the trigger only reports the press', async () => {
    const { ontoggle } = renderMenu();
    const trigger = screen.getByRole('button', { name: 'Menu de Faixas de Áudio' });

    await fireEvent.click(trigger);

    expect(ontoggle).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('marks the trigger and the panel so the player keeps them open', () => {
    renderMenu({ showAudioMenu: true });

    expect(screen.getByRole('button', { name: 'Menu de Faixas de Áudio' })).toHaveAttribute(
      'data-menu-element'
    );
    expect(screen.getByRole('menu', { name: 'Faixa de Áudio' })).toHaveAttribute(
      'data-menu-element'
    );
  });

  it('lists the tracks, marks the active one and reports a pick', async () => {
    const { onselect } = renderMenu({ showAudioMenu: true, activeAudioIndex: 1 });

    expect(screen.getByRole('menuitem', { name: 'Português' })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(screen.getByRole('menuitem', { name: 'Inglês' })).not.toHaveAttribute('aria-current');

    await fireEvent.click(screen.getByRole('menuitem', { name: 'Inglês' }));

    expect(onselect).toHaveBeenCalledWith(0);
  });

  it('floats above the video on the glass surface, keeping the purple glow', () => {
    renderMenu({ showAudioMenu: true });

    expect(screen.getByRole('menu')).toHaveClass(
      'backdrop-blur-md',
      'shadow-glow-primary',
      'bottom-full'
    );
  });

  it('shows keyboard focus on the trigger and on the items', () => {
    renderMenu({ showAudioMenu: true });

    expect(screen.getByRole('button', { name: 'Menu de Faixas de Áudio' })).toHaveClass(
      'focus-visible:ring-2'
    );
    expect(screen.getByRole('menuitem', { name: 'Inglês' })).toHaveClass('focus-visible:ring-2');
  });

  it('has no accessibility violations when open', async () => {
    const { container } = renderMenu({ showAudioMenu: true });

    expect(await axe(container)).toHaveNoViolations();
  });
});
