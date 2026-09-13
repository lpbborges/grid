import { logger } from '$lib/logger';
import { findPreferredSubtitleIndex, type SubtitleTrack } from '$lib/api/subtitles';
import { settingsStore } from '$lib/stores/settings.svelte';

/* global HTMLVideoElement, VTTCue, TextTrackList */

export interface SubtitleGroup {
  label: string;
  subs: SubtitleTrack[];
}

function groupByLanguage(subs: SubtitleTrack[]): SubtitleGroup[] {
  const groups: Record<string, SubtitleTrack[]> = {};
  for (const sub of subs) {
    if (!groups[sub.label]) groups[sub.label] = [];
    groups[sub.label].push(sub);
  }
  return Object.keys(groups)
    .sort()
    .map((label) => ({ label, subs: groups[label] }));
}

export interface UseSubtitleSelectionOptions {
  getVideoElement: () => HTMLVideoElement | null;
  getSubtitles: () => SubtitleTrack[];
  // Whether the surrounding controls (or the audio menu) are visible, so
  // cue positioning can be nudged the same way regardless of which menu
  // triggered it. Read lazily so this composable stays in sync with state
  // that lives in the parent component.
  getControlsVisible: () => boolean;
  getAudioMenuOpen: () => boolean;
}

/**
 * Encapsulates VideoPlayer's subtitle-track grouping/selection/menu state:
 * grouping tracks by language for the CC menu, applying the stored subtitle
 * preference once tracks are ready, keeping the chosen track "showing"
 * against the webview's own automatic track-selection overrides, dynamic
 * cue line positioning, and per-track load-failure tracking.
 */
export function useSubtitleSelection(options: UseSubtitleSelectionOptions) {
  const { getVideoElement, getSubtitles, getControlsVisible, getAudioMenuOpen } = options;

  let showMenu = $state(false);
  let activeIndex = $state(-1);
  const expandedGroups = $state<Record<string, boolean>>({});

  // Tracks whether the initial preference-based subtitle pick has already
  // run, independent of `activeIndex`: `activeIndex === -1` also means
  // "user chose Desativado", and reusing it here would make that explicit
  // choice get silently re-applied every time this re-runs.
  let subtitleAutoApplied = $state(false);

  // Indexes (into `subtitles`) whose <track> failed to load. The browser
  // only fetches a track once its mode leaves 'disabled', so a failure (CSP
  // block, revoked blob URL, unparseable VTT) surfaces right after
  // selection. Without this the menu kept showing the track as selected
  // while nothing rendered.
  let failedTrackIndexes = $state<number[]>([]);
  let subtitleError = $state('');

  function toggleGroup(group: string, label: string) {
    const key = `${group}-${label}`;
    expandedGroups[key] = !expandedGroups[key];
  }

  function applyCueLayout() {
    const videoElement = getVideoElement();
    if (!videoElement) return;
    // The audio/subtitle dropdowns sit bottom-right, right above the
    // controls bar, overlapping the same band a two-line cue would
    // occupy — shift cues further up while either is open, same as the
    // existing controlsVisible adjustment.
    const menuOpen = showMenu || getAudioMenuOpen();
    const controlsVisible = getControlsVisible();
    const targetLine = menuOpen ? 70 : controlsVisible ? 80 : 92;
    for (const textTrack of videoElement.textTracks) {
      if (textTrack.mode !== 'showing' || !textTrack.cues) continue;
      for (let i = 0; i < textTrack.cues.length; i++) {
        const cue = textTrack.cues[i] as VTTCue;
        if (cue.snapToLines !== false || cue.line !== targetLine) {
          cue.snapToLines = false;
          cue.line = targetLine;
        }
      }
    }
  }

  // Every webview runs its own automatic text track selection after
  // <track>s are added, and it overrides the mode set here:
  // - WebKit (WebKitGTK on Linux; WKWebView on macOS, following the system
  //   caption setting) defaults to "forced only" and disables the chosen,
  //   non-forced subtitle track.
  // - Chromium (WebView2 on Windows) enables an extra track matching the
  //   system language, stacking two subtitles.
  // `activeIndex` is the source of truth: re-apply it whenever the engine
  // reports a mode change.
  function syncTrackModes() {
    const videoElement = getVideoElement();
    if (!videoElement) return;
    const list = videoElement.textTracks;
    for (let i = 0; i < list.length; i++) {
      const wanted = i === activeIndex ? 'showing' : 'disabled';
      if (list[i].mode !== wanted) list[i].mode = wanted;
    }
    // The webview's own automatic track selection (see comment above) can
    // override the mode we just corrected, and the cue positions it
    // renders default back to the browser's own line — re-run layout so a
    // cue repositioned by that override doesn't stay stuck there until an
    // unrelated controls-visibility change happens to fix it.
    applyCueLayout();
  }

  let listenedTrackList: TextTrackList | null = null;

  function ensureTrackListListener() {
    const list = getVideoElement()?.textTracks;
    if (!list || list === listenedTrackList || typeof list.addEventListener !== 'function') return;
    listenedTrackList?.removeEventListener('change', syncTrackModes);
    list.addEventListener('change', syncTrackModes);
    listenedTrackList = list;
  }

  function disposeTrackListListener() {
    listenedTrackList?.removeEventListener('change', syncTrackModes);
    listenedTrackList = null;
  }

  function selectTrack(index: number) {
    const videoElement = getVideoElement();
    if (!videoElement) return;
    ensureTrackListListener();
    for (let i = 0; i < videoElement.textTracks.length; i++) {
      videoElement.textTracks[i].mode = 'disabled';
    }
    if (index >= 0) {
      const track = videoElement.textTracks[index];
      track.mode = 'showing';
      track.oncuechange = () => applyCueLayout();
      applyCueLayout();
    }
    activeIndex = index;
    subtitleError = '';
    showMenu = false;
  }

  function applyDefaultSubtitle() {
    const videoElement = getVideoElement();
    const subtitles = getSubtitles();
    if (
      !videoElement ||
      subtitleAutoApplied ||
      settingsStore.subtitle === 'none' ||
      subtitles.length === 0 ||
      videoElement.textTracks.length < subtitles.length
    ) {
      return;
    }
    subtitleAutoApplied = true;

    const idx = findPreferredSubtitleIndex(subtitles, settingsStore.subtitle);
    if (idx !== -1) selectTrack(idx);
  }

  function handleTrackError(index: number) {
    const subtitles = getSubtitles();
    logger.warn('Subtitle track failed to load:', subtitles[index]?.label);
    if (!failedTrackIndexes.includes(index)) failedTrackIndexes.push(index);
    if (index !== activeIndex) return;
    const track = getVideoElement()?.textTracks[index];
    if (track) track.mode = 'disabled';
    activeIndex = -1;
    subtitleError = 'Não foi possível carregar a legenda.';
  }

  function resetTrackErrorState() {
    failedTrackIndexes = [];
    subtitleError = '';
  }

  return {
    get showMenu() {
      return showMenu;
    },
    set showMenu(value: boolean) {
      showMenu = value;
    },
    get activeIndex() {
      return activeIndex;
    },
    get expandedGroups() {
      return expandedGroups;
    },
    get subtitleAutoApplied() {
      return subtitleAutoApplied;
    },
    get failedTrackIndexes() {
      return failedTrackIndexes;
    },
    get subtitleError() {
      return subtitleError;
    },
    groupByLanguage,
    toggleGroup,
    applyCueLayout,
    syncTrackModes,
    ensureTrackListListener,
    disposeTrackListListener,
    selectTrack,
    applyDefaultSubtitle,
    handleTrackError,
    resetTrackErrorState
  };
}
