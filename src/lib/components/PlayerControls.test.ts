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

    await fireEvent.click(screen.getByLabelText('Ativar/desativar mudo'));

    // Muting reports 0, not mpv's 0-100 percent: converting is the native
    // host's job, so this stays the scale the <video> element uses.
    expect(onvolume).toHaveBeenCalledWith(0);
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
});
