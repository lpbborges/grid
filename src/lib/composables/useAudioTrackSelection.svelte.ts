import { getLanguageName } from '$lib/api/subtitles';
import { resolvePreferredAudioTrack, type ParsedAudioTrack } from '$lib/utils/audioTrack';

/* global HTMLVideoElement */

/**
 * Encapsulates VideoPlayer's audio-track detection/selection: parsing the
 * native `videoElement.audioTracks` list (deduping tracks that resolve to
 * the same display label), applying the stored audio preference via
 * `resolvePreferredAudioTrack`, and letting the user override the choice
 * from the audio menu.
 */
export function useAudioTrackSelection() {
  let audioTracks = $state<ParsedAudioTrack[]>([]);
  let showAudioMenu = $state(false);
  let activeAudioIndex = $state(0);

  function handleLoadedMetadata(
    videoElement: HTMLVideoElement | null,
    audioPreference: string | undefined,
    originalLanguage?: string
  ) {
    const tracks = (videoElement as any)?.audioTracks;
    if (!tracks) return;

    const parsed: ParsedAudioTrack[] = [];
    const seenLanguages: Record<string, boolean> = {};

    for (let i = 0; i < tracks.length; i++) {
      const label =
        getLanguageName(tracks[i].label, true) ||
        getLanguageName(tracks[i].language, true) ||
        `Faixa ${i + 1}`;

      if (seenLanguages[label]) {
        tracks[i].enabled = false;
        continue;
      }
      seenLanguages[label] = true;

      parsed.push({
        index: i,
        id: tracks[i].id,
        label,
        enabled: tracks[i].enabled
      });
    }

    const preferredAudioIdx = resolvePreferredAudioTrack(parsed, audioPreference, originalLanguage);

    if (preferredAudioIdx !== -1) {
      // the index in 'parsed' is preferredAudioIdx, but we need the native tracks index
      const nativeIndex = parsed[preferredAudioIdx].index;
      activeAudioIndex = nativeIndex;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].enabled = i === nativeIndex;
      }
      for (let i = 0; i < parsed.length; i++) {
        parsed[i].enabled = i === preferredAudioIdx;
      }
    } else {
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].enabled) activeAudioIndex = i;
      }
      for (let i = 0; i < parsed.length; i++) {
        parsed[i].enabled = parsed[i].index === activeAudioIndex;
      }
    }

    audioTracks = parsed;

    tracks.onchange = () => {
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].enabled) {
          activeAudioIndex = i;
          break;
        }
      }
    };
  }

  function selectAudioTrack(videoElement: HTMLVideoElement | null, index: number) {
    const tracks = (videoElement as any)?.audioTracks;
    if (tracks) {
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].enabled = i === index;
      }
      activeAudioIndex = index;
    }
    showAudioMenu = false;
  }

  return {
    get audioTracks() {
      return audioTracks;
    },
    get showAudioMenu() {
      return showAudioMenu;
    },
    set showAudioMenu(value: boolean) {
      showAudioMenu = value;
    },
    get activeAudioIndex() {
      return activeAudioIndex;
    },
    handleLoadedMetadata,
    selectAudioTrack
  };
}
