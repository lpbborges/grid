<script lang="ts">
  import { playerState } from '$lib/stores.svelte';
  import PlayerControls from './PlayerControls.svelte';
  import { groupByLanguage } from '$lib/composables/useSubtitleSelection.svelte';
  import { type useMpvBackend } from '$lib/composables/useMpvBackend.svelte';
  import type { SubtitleTrack } from '$lib/api/subtitles';

  /**
   * The in-app player for the native backend.
   *
   * mpv renders *behind* the webview, reparented into this window, so this
   * component draws nothing where the video is and only composites Grid's
   * controls on top. Everything the user presses goes to mpv over IPC.
   */
  let {
    player,
    engineStatus = '',
    onclose
  } = $props<{
    player: ReturnType<typeof useMpvBackend>;
    engineStatus?: string;
    onclose?: () => void;
  }>();

  let showControls = $state(true);
  let controlsTimeout: number | undefined;
  let showAudioMenu = $state(false);
  let showSubtitleMenu = $state(false);
  let expandedGroups = $state<Record<string, boolean>>({});

  // PlayerControls reports the row that was clicked; mapping an index back to
  // an mpv track id is this component's job, exactly as mapping it to a DOM
  // track is VideoPlayer's. mpv numbers tracks per type, so the audio list and
  // the subtitle list are indexed separately.

  // nativeTrackLabel is reused rather than re-derived: a second labelling rule
  // would drift from the one the preference resolvers already match against.

  // Shaped as SubtitleTrack so the shared menu can render mpv's tracks, and
  // grouped with the same helper the <video> path uses.

  const embeddedSubsGrouped = $derived(
    groupByLanguage(player.subtitles.filter((s: SubtitleTrack) => s.group === 'Embedded'))
  );
  const externalSubsGrouped = $derived(
    groupByLanguage(player.subtitles.filter((s: SubtitleTrack) => s.group === 'Extra'))
  );

  const controlsVisible = $derived(
    showControls || player.paused || showSubtitleMenu || showAudioMenu
  );

  // Every layer from the document down to the layout wrapper has to be clear
  // for mpv's window to show through, but ONLY once mpv is actually painting.
  //
  // `isRunning` is not enough. The surface mounts while the stream is still
  // being prepared, and even after `file-loaded` mpv sits paused with nothing
  // on screen - which is the state a replayed title passes through. Clearing
  // the background in either one leaves nothing behind the webview at all and
  // the desktop shows through the whole window.
  $effect(() => {
    if (!player.hasVideo) return;
    document.body.classList.add('native-player-active');
    return () => document.body.classList.remove('native-player-active');
  });

  function toggleGroup(groupKey: string, label: string) {
    const key = `${groupKey}-${label}`;
    expandedGroups = { ...expandedGroups, [key]: !expandedGroups[key] };
  }

  /**
   * mpv follows the Tauri window, so fullscreen here is the window's, not a
   * DOM fullscreen request - there is no element to expand.
   */

  function handleKeydown(e: KeyboardEvent) {
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

    switch (e.key) {
      case ' ':
        if (active && (active.tagName === 'BUTTON' || active.getAttribute('role') === 'slider')) {
          return;
        }
        e.preventDefault();
        void player.togglePlay();
        revealControls();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        void player.seek(player.currentTime - 5);
        revealControls();
        break;
      case 'ArrowRight':
        e.preventDefault();
        void player.seek(player.currentTime + 5);
        revealControls();
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  }

  function close() {
    void player.stop();
    onclose?.();
  }

  // Mirrors VideoPlayer: without a hide timer the gradient bar and the back
  // arrow sit over the picture for the whole film with no way to dismiss them.
  function scheduleHideControls() {
    window.clearTimeout(controlsTimeout);
    controlsTimeout = window.setTimeout(() => {
      if (!player.paused) showControls = false;
    }, 2500);
  }

  function revealControls() {
    showControls = true;
    scheduleHideControls();
  }

  $effect(() => {
    scheduleHideControls();
    return () => window.clearTimeout(controlsTimeout);
  });

  // Titlebar fades itself out on this. Only VideoPlayer used to write it, so
  // on this path the titlebar gradient never left the top of the video.
  $effect(() => {
    playerState.showControls = controlsVisible;
    return () => {
      playerState.showControls = true;
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  role="region"
  aria-label="Reprodutor de Vídeo"
  class="fixed inset-0 z-[100] flex h-screen w-screen flex-col overflow-hidden {player.hasVideo
    ? ''
    : 'bg-backdrop'}"
  data-testid="native-player-surface"
  data-native-player
  onmousemove={revealControls}
>
  {#if player.hasVideo}
    <!--
      No background, no child that paints one: mpv's window sits directly
      behind this element and any fill hides it completely.
    -->
    <div class="flex-1" data-testid="native-video-hole"></div>
  {:else}
    <!-- Nothing is behind the webview yet, so this has to paint. -->
    <div
      class="flex flex-1 flex-col items-center justify-center px-4 text-center select-none"
      data-testid="native-loading"
    >
      <div class="relative mb-6 h-16 w-16" data-testid="loading-spinner">
        <div
          class="border-t-green border-b-primary absolute inset-0 animate-spin rounded-full border-4 border-transparent"
        ></div>
        <div
          class="border-l-primary border-r-green absolute inset-2 animate-[spin_1.5s_linear_reverse] rounded-full border-4 border-transparent"
        ></div>
      </div>
      <div
        class="font-cyber text-green mb-2 text-xl tracking-widest uppercase [text-shadow:0_0_10px_rgba(54,211,83,0.8)]"
      >
        {engineStatus || 'Carregando...'}
      </div>
    </div>
  {/if}

  <PlayerControls
    currentTime={player.currentTime}
    duration={player.duration}
    paused={player.paused}
    volume={player.volume}
    visible={controlsVisible}
    subtitles={player.subtitles}
    torrentSubsGrouped={embeddedSubsGrouped}
    {externalSubsGrouped}
    activeSubtitleIndex={player.activeSubtitleIndex}
    {expandedGroups}
    {showSubtitleMenu}
    audioTracks={player.audioTracks}
    activeAudioIndex={player.activeAudioIndex}
    {showAudioMenu}
    onplaypause={() => void player.togglePlay()}
    onseek={(seconds) => void player.seek(seconds)}
    onvolume={(value) => void player.setVolume(value)}
    onselectaudio={(index) => void player.selectAudio(index)}
    onselectsubtitle={(index) => void player.selectSubtitle(index)}
    ontoggleaudiomenu={() => (showAudioMenu = !showAudioMenu)}
    ontogglesubtitlemenu={() => (showSubtitleMenu = !showSubtitleMenu)}
    ontogglegroup={toggleGroup}
    onfullscreen={() => void player.toggleFullscreen()}
    onclose={close}
  />
</div>
