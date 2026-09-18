import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSubtitleSelection } from './useSubtitleSelection.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';
import type { SubtitleTrack } from '$lib/api/subtitles';

vi.mock('$lib/stores/settings.svelte', () => ({
  settingsStore: {
    subtitle: 'pt'
  }
}));

describe('useSubtitleSelection', () => {
  function createFakeVideoElement(tracks: any[]) {
    return {
      textTracks: tracks as any
    } as HTMLVideoElement;
  }

  let mockOptions: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOptions = {
      getVideoElement: vi.fn(),
      getSubtitles: vi.fn().mockReturnValue([]),
      getControlsVisible: vi.fn().mockReturnValue(false),
      getAudioMenuOpen: vi.fn().mockReturnValue(false)
    };
    settingsStore.subtitle = 'pt';
  });

  it('groups subtitles by language', () => {
    const selection = useSubtitleSelection(mockOptions);
    const subs: SubtitleTrack[] = [
      { id: '1', label: 'English', url: '1', lang: 'en', group: 'Extra' },
      { id: '2', label: 'Portuguese', url: '2', lang: 'pt', group: 'Extra' },
      { id: '3', label: 'English', url: '3', lang: 'en', group: 'Extra' }
    ];

    const groups = selection.groupByLanguage(subs);
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('English');
    expect(groups[0].subs).toHaveLength(2);
    expect(groups[1].label).toBe('Portuguese');
    expect(groups[1].subs).toHaveLength(1);
  });

  it('toggles group expansion', () => {
    const selection = useSubtitleSelection(mockOptions);
    expect(selection.expandedGroups['lang-English']).toBeUndefined();

    selection.toggleGroup('lang', 'English');
    expect(selection.expandedGroups['lang-English']).toBe(true);

    selection.toggleGroup('lang', 'English');
    expect(selection.expandedGroups['lang-English']).toBe(false);
  });

  it('selects a track and updates modes correctly', () => {
    const fakeTracks = [
      { mode: 'disabled', oncuechange: null },
      { mode: 'showing', oncuechange: null }
    ];
    mockOptions.getVideoElement.mockReturnValue(createFakeVideoElement(fakeTracks));

    const selection = useSubtitleSelection(mockOptions);
    selection.selectTrack(0);

    expect(selection.activeIndex).toBe(0);
    expect(fakeTracks[0].mode).toBe('showing');
    expect(fakeTracks[1].mode).toBe('disabled');
  });

  it('handles track error and disables track', () => {
    const fakeTracks = [{ mode: 'showing', oncuechange: null }];
    mockOptions.getVideoElement.mockReturnValue(createFakeVideoElement(fakeTracks));
    mockOptions.getSubtitles.mockReturnValue([
      { id: '1', label: 'English', url: '1', lang: 'en', group: 'Extra' }
    ]);

    const selection = useSubtitleSelection(mockOptions);
    selection.selectTrack(0); // active is now 0

    selection.handleTrackError(0);

    expect(selection.failedTrackIndexes).toContain(0);
    expect(selection.activeIndex).toBe(-1);
    expect(selection.subtitleError).toBe('Não foi possível carregar a legenda.');
    expect(fakeTracks[0].mode).toBe('disabled');
  });

  it('applies default subtitle based on settings', () => {
    const fakeTracks = [
      { mode: 'disabled', oncuechange: null },
      { mode: 'disabled', oncuechange: null }
    ];
    mockOptions.getVideoElement.mockReturnValue(createFakeVideoElement(fakeTracks));
    // Subtitles have labels that might match 'pt'
    mockOptions.getSubtitles.mockReturnValue([
      { id: '1', lang: 'en', label: 'English', url: '1', group: 'Extra' },
      { id: '2', lang: 'por', label: 'Português', url: '2', group: 'Extra' }
    ]);

    const selection = useSubtitleSelection(mockOptions);
    selection.applyDefaultSubtitle();

    expect(selection.subtitleAutoApplied).toBe(true);
    // Since settingsStore.subtitle is 'pt', it should match 'Português' (index 1)
    expect(selection.activeIndex).toBe(1);
    expect(fakeTracks[1].mode).toBe('showing');
  });

  it('syncTrackModes enforces active index mode', () => {
    const fakeTracks = [
      { mode: 'showing', oncuechange: null },
      { mode: 'disabled', oncuechange: null }
    ];
    mockOptions.getVideoElement.mockReturnValue(createFakeVideoElement(fakeTracks));

    const selection = useSubtitleSelection(mockOptions);
    selection.selectTrack(1); // activeIndex is now 1

    // simulate external interference
    fakeTracks[0].mode = 'showing';
    fakeTracks[1].mode = 'disabled';

    selection.syncTrackModes();

    expect(fakeTracks[0].mode).toBe('disabled');
    expect(fakeTracks[1].mode).toBe('showing');
  });

  it('ensureTrackListListener and disposeTrackListListener work', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const fakeTracks: any = [];
    fakeTracks.addEventListener = addEventListener;
    fakeTracks.removeEventListener = removeEventListener;
    mockOptions.getVideoElement.mockReturnValue(createFakeVideoElement(fakeTracks));

    const selection = useSubtitleSelection(mockOptions);
    selection.ensureTrackListListener();
    expect(addEventListener).toHaveBeenCalledWith('change', selection.syncTrackModes);

    selection.disposeTrackListListener();
    expect(removeEventListener).toHaveBeenCalledWith('change', selection.syncTrackModes);
  });

  it('applyCueLayout updates cue lines depending on visibility', () => {
    const cues = [{ snapToLines: true, line: 0 }];
    const fakeTracks = [{ mode: 'showing', cues }];
    mockOptions.getVideoElement.mockReturnValue(createFakeVideoElement(fakeTracks));
    mockOptions.getControlsVisible.mockReturnValue(true);

    const selection = useSubtitleSelection(mockOptions);
    selection.applyCueLayout();

    expect(cues[0].snapToLines).toBe(false);
    expect(cues[0].line).toBe(80); // controls visible but no menu

    selection.showMenu = true;
    selection.applyCueLayout();
    expect(cues[0].line).toBe(70); // menu visible
  });

  it('resetTrackErrorState clears errors', () => {
    const fakeTracks = [{ mode: 'showing', oncuechange: null }];
    mockOptions.getVideoElement.mockReturnValue(createFakeVideoElement(fakeTracks));
    mockOptions.getSubtitles.mockReturnValue([
      { id: '1', lang: 'en', label: 'English', url: '1', group: 'Extra' }
    ]);

    const selection = useSubtitleSelection(mockOptions);
    selection.selectTrack(0);
    selection.handleTrackError(0);

    expect(selection.subtitleError).toBeTruthy();
    expect(selection.failedTrackIndexes).toHaveLength(1);

    selection.resetTrackErrorState();

    expect(selection.subtitleError).toBeFalsy();
    expect(selection.failedTrackIndexes).toHaveLength(0);
  });
});
