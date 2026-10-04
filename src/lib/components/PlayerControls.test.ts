import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PlayerControls from './PlayerControls.svelte';

function baseProps(overrides = {}) {
  return {
    currentTime: 0,
    duration: 100,
    paused: false,
    volume: 1,
    visible: true,
    activeAudioIndex: -1,
    activeSubtitleIndex: -1,
    onplaypause: vi.fn(),
    onseek: vi.fn(),
    onvolume: vi.fn(),
    onmute: vi.fn(),
    onselectaudio: vi.fn(),
    onselectsubtitle: vi.fn(),
    ...overrides
  };
}

describe('PlayerControls', () => {
  it('reports a seek target rather than mutating anything', async () => {
    const onseek = vi.fn();
    render(PlayerControls, baseProps({ duration: 100, onseek }));

    await fireEvent.click(screen.getByLabelText('Buscar posição'), { clientX: 50 });

    // The host decides what a seek means: assigning to a <video> on macOS,
    // a seek in in-process libmpv on Linux and Windows.
    expect(onseek).toHaveBeenCalled();
    expect(typeof onseek.mock.calls[0][0]).toBe('number');
  });

  it('shows the play label while paused', () => {
    render(PlayerControls, baseProps({ paused: true }));

    expect(screen.getByLabelText('Reproduzir')).toBeInTheDocument();
  });

  it('shows the pause label while playing', () => {
    render(PlayerControls, baseProps({ paused: false }));

    expect(screen.getByLabelText('Pausar')).toBeInTheDocument();
  });

  it('asks the host to toggle when the play control is pressed', async () => {
    const onplaypause = vi.fn();
    render(PlayerControls, baseProps({ paused: true, onplaypause }));

    await fireEvent.click(screen.getByLabelText('Reproduzir'));

    expect(onplaypause).toHaveBeenCalled();
  });

  it('reports a volume on the DOM 0-1 scale', async () => {
    const onvolume = vi.fn();
    render(PlayerControls, baseProps({ volume: 1, onvolume }));

    await fireEvent.input(screen.getByLabelText('Volume'), { target: { value: '0.5' } });

    expect(onvolume).toHaveBeenCalledWith(0.5);
  });

  it('asks the shell to toggle mute', async () => {
    const onmute = vi.fn();
    render(PlayerControls, baseProps({ onmute }));

    await fireEvent.click(screen.getByLabelText('Ativar/desativar mudo'));

    expect(onmute).toHaveBeenCalledOnce();
  });

  it('renders the elapsed and total time', () => {
    render(PlayerControls, baseProps({ currentTime: 65, duration: 3700 }));

    expect(screen.getByText('1:05 / 1:01:40')).toBeInTheDocument();
  });

  it('hides the close and fullscreen buttons when the host offers no handler', () => {
    render(PlayerControls, baseProps());

    // The native surface has no DOM fullscreen to request, so a button that
    // does nothing must not be shown.
    expect(screen.queryByLabelText('Fechar')).toBeNull();
    expect(screen.queryByLabelText('Tela cheia')).toBeNull();
  });

  it('never renders engine status over the film', () => {
    // Status belongs to the centred loading view. Rendered here it sat over
    // the picture for the whole runtime.
    render(PlayerControls, baseProps({ engineStatus: 'Carregando vídeo...' }));

    expect(screen.queryByText('Carregando vídeo...')).toBeNull();
  });

  it('has no episode list button unless the host provides one', () => {
    render(PlayerControls, baseProps());

    expect(screen.queryByRole('button', { name: 'Lista de episódios' })).toBeNull();
  });

  it('names the episode list button, reports its state and toggles it', async () => {
    const ontoggleepisodes = vi.fn();
    render(PlayerControls, baseProps({ ontoggleepisodes, showEpisodePanel: true }));
    const button = screen.getByRole('button', { name: 'Lista de episódios' });

    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('data-menu-element');

    await fireEvent.click(button);
    expect(ontoggleepisodes).toHaveBeenCalledTimes(1);
  });
});
