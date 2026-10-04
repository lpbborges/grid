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
  const handlers = {
    ontoggle: vi.fn(),
    onselect: vi.fn(),
    ontogglegroup: vi.fn(),
    onscale: vi.fn()
  };
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
    scale: 100,
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
    expect(
      screen.getByRole('menu', { name: 'Legendas' }).closest('[data-menu-element]')
    ).not.toBeNull();
    expect(screen.getByRole('group', { name: 'Tamanho da legenda' })).toBeInTheDocument();
  });

  it('shows the current size and steps it up and down', async () => {
    const { onscale } = renderMenu({ scale: 100 });

    expect(screen.getByText('100%')).toHaveAttribute('aria-live', 'polite');
    await fireEvent.click(screen.getByRole('button', { name: 'Aumentar tamanho da legenda' }));
    expect(onscale).toHaveBeenLastCalledWith(125);
    await fireEvent.click(screen.getByRole('button', { name: 'Diminuir tamanho da legenda' }));
    expect(onscale).toHaveBeenLastCalledWith(75);
  });

  it('disables the stepper at both ends', () => {
    renderMenu({ scale: 200 });
    expect(screen.getByRole('button', { name: 'Aumentar tamanho da legenda' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Diminuir tamanho da legenda' })).toBeEnabled();
  });

  it('disables the decrease button at the smallest size', () => {
    renderMenu({ scale: 75 });
    expect(screen.getByRole('button', { name: 'Diminuir tamanho da legenda' })).toBeDisabled();
  });

  it('keeps the menu open and marks the stepper buttons for the player', async () => {
    const { onselect, ontoggle } = renderMenu();
    const increase = screen.getByRole('button', { name: 'Aumentar tamanho da legenda' });

    await fireEvent.click(increase);

    expect(increase.closest('[data-menu-element]')).not.toBeNull();
    expect(onselect).not.toHaveBeenCalled();
    expect(ontoggle).not.toHaveBeenCalled();
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
