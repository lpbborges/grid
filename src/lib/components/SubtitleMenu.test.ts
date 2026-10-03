import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { axe } from 'vitest-axe';
import SubtitleMenu from './SubtitleMenu.svelte';
import type { SubtitleTrack } from '$lib/types';

const track = (id: string, label: string): SubtitleTrack => ({
  id,
  lang: 'por',
  label,
  url: '',
  group: 'Embedded'
});
const single = track('1', 'Português');
const pair = [track('2', 'Inglês A'), track('3', 'Inglês B')];

function renderMenu(props: Record<string, unknown> = {}) {
  const handlers = { ontoggle: vi.fn(), onselect: vi.fn(), ontogglegroup: vi.fn() };
  const subtitles = [single, ...pair];
  const { container } = render(SubtitleMenu, {
    subtitles,
    torrentSubsGrouped: [
      { label: 'Português', subs: [single] },
      { label: 'Inglês', subs: pair }
    ],
    externalSubsGrouped: [],
    activeIndex: -1,
    failedTrackIndexes: [],
    expandedGroups: {},
    subtitleError: '',
    showMenu: true,
    ...handlers,
    ...props
  });
  return { ...handlers, container };
}

describe('SubtitleMenu', () => {
  it('renders nothing without subtitles', () => {
    renderMenu({ subtitles: [], showMenu: false });

    expect(screen.queryByLabelText('Menu de Legendas')).toBeNull();
  });

  it('only reports the trigger press and marks trigger and panel for the player', async () => {
    const { ontoggle } = renderMenu();
    const trigger = screen.getByRole('button', { name: 'Menu de Legendas' });

    await fireEvent.click(trigger);

    expect(ontoggle).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute('data-menu-element');
    expect(screen.getByRole('menu', { name: 'Legendas' })).toHaveAttribute('data-menu-element');
  });

  it('puts Desativado first, current when no subtitle is active', async () => {
    const { onselect } = renderMenu();
    const items = screen.getAllByRole('menuitem');

    expect(items[0]).toHaveTextContent('Desativado');
    expect(items[0]).toHaveAttribute('aria-current', 'true');

    await fireEvent.click(screen.getByRole('menuitem', { name: 'Português' }));

    expect(onselect).toHaveBeenCalledWith(0);
  });

  it('expands groups with several options only on request', async () => {
    const { ontogglegroup } = renderMenu();
    const group = screen.getByRole('menuitem', { name: 'Inglês' });

    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menuitem', { name: 'Opção 1' })).toBeNull();

    await fireEvent.click(group);

    expect(ontogglegroup).toHaveBeenCalledWith('Embedded', 'Inglês');
  });

  it('lists the options of an expanded group and picks one', async () => {
    const { onselect } = renderMenu({ expandedGroups: { 'Embedded-Inglês': true } });

    expect(screen.getByRole('menuitem', { name: 'Inglês' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Opção 2' }));

    expect(onselect).toHaveBeenCalledWith(2);
  });

  it('disables a subtitle that failed to load', () => {
    renderMenu({ failedTrackIndexes: [0] });

    expect(screen.getByRole('menuitem', { name: 'Português' })).toBeDisabled();
  });

  it('shows a subtitle error next to the trigger', () => {
    renderMenu({ subtitleError: 'Não foi possível carregar a legenda.', showMenu: false });

    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível carregar a legenda.');
  });

  it('has no accessibility violations when open', async () => {
    const { container } = renderMenu();

    expect(await axe(container)).toHaveNoViolations();
  });
});
