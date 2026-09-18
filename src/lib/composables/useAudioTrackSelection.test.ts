import { describe, it, expect } from 'vitest';
import { useAudioTrackSelection } from './useAudioTrackSelection.svelte';

describe('useAudioTrackSelection', () => {
  function createFakeVideoElement(tracks: any[]) {
    const audioTracks = [...tracks] as any;
    audioTracks.onchange = null;
    return { audioTracks } as unknown as HTMLVideoElement;
  }

  it('initializes with no tracks if videoElement is null', () => {
    const { audioTracks } = useAudioTrackSelection();
    expect(audioTracks).toEqual([]);
  });

  it('parses and dedupes native audio tracks based on language names', () => {
    const selection = useAudioTrackSelection();

    const fakeVideo = createFakeVideoElement([
      { id: '1', label: 'English', language: 'en', enabled: false },
      { id: '2', label: 'Portuguese', language: 'pt', enabled: true },
      // Duplicate language label should be disabled and deduped
      { id: '3', label: '', language: 'en', enabled: false }
    ]);

    selection.handleLoadedMetadata(fakeVideo, undefined);

    expect(selection.audioTracks).toHaveLength(2);
    expect(selection.audioTracks[0].label).toBe('Inglês');
    expect(selection.audioTracks[1].label).toBe('Português');
    expect(fakeVideo.audioTracks[2].enabled).toBe(false);
  });

  it('selects preferred audio track if provided', () => {
    const selection = useAudioTrackSelection();

    const fakeVideo = createFakeVideoElement([
      { id: '1', label: 'English', language: 'en', enabled: true },
      { id: '2', label: 'Portuguese', language: 'pt', enabled: false }
    ]);

    selection.handleLoadedMetadata(fakeVideo, 'pt', 'en');

    expect(selection.activeAudioIndex).toBe(1);
    expect(fakeVideo.audioTracks[0].enabled).toBe(false);
    expect(fakeVideo.audioTracks[1].enabled).toBe(true);
  });

  it('selects track from menu and updates active index', () => {
    const selection = useAudioTrackSelection();

    const fakeVideo = createFakeVideoElement([
      { id: '1', label: 'English', language: 'en', enabled: true },
      { id: '2', label: 'Portuguese', language: 'pt', enabled: false }
    ]);

    selection.handleLoadedMetadata(fakeVideo, undefined);
    expect(selection.activeAudioIndex).toBe(0);

    selection.showAudioMenu = true;
    selection.selectAudioTrack(fakeVideo, 1);

    expect(selection.activeAudioIndex).toBe(1);
    expect(selection.showAudioMenu).toBe(false);
    expect(fakeVideo.audioTracks[0].enabled).toBe(false);
    expect(fakeVideo.audioTracks[1].enabled).toBe(true);
  });

  it('updates active index when native onchange fires', () => {
    const selection = useAudioTrackSelection();

    const fakeVideo = createFakeVideoElement([
      { id: '1', label: 'English', language: 'en', enabled: true },
      { id: '2', label: 'Portuguese', language: 'pt', enabled: false }
    ]);

    selection.handleLoadedMetadata(fakeVideo, undefined);

    // Simulate browser enabling a track
    fakeVideo.audioTracks[0].enabled = false;
    fakeVideo.audioTracks[1].enabled = true;
    if ((fakeVideo.audioTracks as any).onchange) {
      (fakeVideo.audioTracks as any).onchange();
    }

    expect(selection.activeAudioIndex).toBe(1);
  });
});
