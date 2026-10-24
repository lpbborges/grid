<script lang="ts">
  import { untrack } from 'svelte';
  import { logger } from '$lib/logger';
  import { translateEpisodesList } from '$lib/api/translate';
  import Player from '$lib/components/Player.svelte';
  import LoadingIndicator from '$lib/components/LoadingIndicator.svelte';
  import MediaInfo from '$lib/components/MediaInfo.svelte';
  import MediaBackdrop from '$lib/components/MediaBackdrop.svelte';
  import EpisodeList from '$lib/components/EpisodeList.svelte';
  import ErrorNotice from '$lib/components/ErrorNotice.svelte';
  import LazyCatalogRow from '$lib/components/LazyCatalogRow.svelte';
  import { similarTitlesRow } from '$lib/utils/catalogRows';
  import {
    usePlayer,
    type NextPlaybackResult,
    type PlayerPlayOptions
  } from '$lib/composables/usePlayer.svelte';
  import { useUpNext } from '$lib/composables/useUpNext.svelte';
  import { useTranslatedMedia } from '$lib/composables/useTranslatedMedia.svelte';
  import { usePlaybackErrors } from '$lib/composables/usePlaybackErrors.svelte';
  import { findEpisodeStream } from '$lib/engine/episodeStream';

  import { settingsStore } from '$lib/stores/settings.svelte';
  import { watchedStore } from '$lib/stores/watched.svelte';
  import { progressStore } from '$lib/stores/progress.svelte';
  import type { Episode, EpisodeRef, Series, UpNextCard } from '$lib/types';
  import {
    episodeLabel,
    firstEpisode,
    focusedEpisode,
    nextEpisode,
    sameEpisode
  } from '$lib/utils/episodes';
  import type { ErrorAction } from '$lib/utils/pageError';

  let { data } = $props();
  let seriesId = $derived(data.seriesId);
  let series = $derived(data.series);
  const playbackErrors = usePlaybackErrors();
  let similarRow = $derived(series ? similarTitlesRow('series', series.genres) : null);
  let lastAttemptedEpisode = $state<Episode | null>(null);
  let advancingTo = $state<Episode | null>(null);
  let focusEpisode = $derived(
    series
      ? focusedEpisode(
          series.videos,
          progressStore.latestEpisodeFor(seriesId),
          data.requestedEpisode
        )
      : null
  );

  const player = usePlayer(() => videoElement, {
    onwatched: () => {
      if (lastAttemptedEpisode) {
        watchedStore.add(seriesId, lastAttemptedEpisode.season, lastAttemptedEpisode.episode);
      }
    },
    onfinished: () => {
      if (upNext.armed()) upNext.playNow();
      else void player.stop();
    }
  });
  const backend = player.backend;

  const upNextEpisode = $derived(
    series && lastAttemptedEpisode ? nextEpisode(series.videos, lastAttemptedEpisode) : null
  );

  const upNext = useUpNext(
    {
      get key() {
        return player.isPlaying && lastAttemptedEpisode ? episodeLabel(lastAttemptedEpisode) : '';
      },
      get currentTime() {
        return backend.currentTime;
      },
      get duration() {
        return backend.duration;
      },
      get paused() {
        return backend.paused || backend.buffering;
      },
      get hasNext() {
        return upNextEpisode !== null;
      }
    },
    () => {
      if (upNextEpisode) void advanceTo(upNextEpisode);
    }
  );

  function episodeName(ref: EpisodeRef): string {
    const episode = series?.videos.find((v) => sameEpisode(v, ref));
    return (episode && (translatedEpisodes[episode.id] || episode.name)) || '';
  }

  function episodeTitle(ref: EpisodeRef): string {
    const name = episodeName(ref);
    return name ? `${episodeLabel(ref)} · ${name}` : episodeLabel(ref);
  }

  const preparingEpisode = $derived(advancingTo ?? lastAttemptedEpisode);

  const upNextCard = $derived.by((): UpNextCard | null => {
    if (!upNext.visible || !upNextEpisode) return null;
    return {
      title: episodeTitle(upNextEpisode),
      secondsLeft: upNext.secondsLeft,
      onplay: upNext.playNow,
      oncancel: upNext.cancel
    };
  });
  // Windows plays through mpv embedded in this window; else mounts <video>.
  let videoElement = $state<HTMLVideoElement | null>(null);

  const translated = useTranslatedMedia(() => series);

  let selectedSeason = $state<number | null>(null);
  let translatedEpisodes = $state<Record<string, string>>({});

  $effect(() => {
    if (data.error) {
      logger.error('Falha ao carregar série:', data.error);
      playbackErrors.setError('Não foi possível carregar este título.', 'reload');
    } else if (seriesId) {
      playbackErrors.clearError();
    }
  });

  // Only stop an in-progress stream when seriesId actually changes (navigating
  // to a different series) — not on the initial mount, when there is nothing
  // to stop yet. Calling stop() unconditionally on mount let this effect race
  // with an immediate play() click (see the video-cache feature's Task 9).
  let hasMountedTorrentEffect = false;
  let autoplayStarted = false;
  let autoplayPending = $state(untrack(() => data.autoplay));
  $effect(() => {
    if (seriesId) {
      autoplayStarted = false;
      autoplayPending = untrack(() => data.autoplay);
      selectedSeason = untrack(() => focusEpisode?.season) ?? null;
      translatedEpisodes = {};
      if (hasMountedTorrentEffect) {
        untrack(() => player.stop());
      }
      hasMountedTorrentEffect = true;
    }
  });

  $effect(() => {
    if (series && series.videos && series.videos.length > 0) {
      const episodesToTranslate = series.videos.filter((v) => v.season === selectedSeason);
      if (episodesToTranslate.length > 0) {
        translateEpisodesList(episodesToTranslate).then((res) => {
          translatedEpisodes = { ...translatedEpisodes, ...res };
        });
      }
    }
  });

  // The hover card's Play opens the page with ?play=1: play the episode in focus, or the first.
  $effect(() => {
    if (!data.autoplay || !series || autoplayStarted) return;
    autoplayStarted = true;
    const shown = series;
    const target =
      shown.videos.find((v) => focusEpisode && sameEpisode(v, focusEpisode)) ??
      firstEpisode(shown.videos);
    if (target) {
      untrack(() => void playEpisode(target).finally(() => (autoplayPending = false)));
    } else {
      autoplayPending = false;
    }
  });

  function episodePlayOptions(
    shown: Series,
    episode: EpisodeRef,
    fileIdx: number | undefined
  ): PlayerPlayOptions {
    return {
      mediaId: seriesId,
      season: episode.season,
      episode: episode.episode,
      fileIdx,
      originalLanguage: shown.language,
      progress: {
        meta: {
          type: 'series',
          title: translated.title || shown.title,
          poster: shown.medium_cover_image
        },
        next: nextEpisode(shown.videos, episode)
      }
    };
  }

  // Sources that failed for the episode being tried; "Tentar outra fonte" skips them.
  let failedSourcesFor = '';
  let currentSource = '';

  async function findSource(shown: Series, episode: Episode) {
    const key = `${seriesId}:${episodeLabel(episode)}`;
    if (key !== failedSourcesFor) {
      playbackErrors.failedSources.clear();
      failedSourcesFor = key;
    }
    const found = await findEpisodeStream(
      { id: seriesId, title: shown.title },
      episode,
      {
        quality: settingsStore.quality,
        audio: settingsStore.audio,
        subtitle: settingsStore.subtitle
      },
      playbackErrors.failedSources
    );
    if (!('error' in found)) currentSource = found.infoHash;
    return found;
  }

  async function playEpisode(episode: Episode, startOver = false) {
    if (typeof window === 'undefined' || !series) return;
    const shown = series;

    lastAttemptedEpisode = episode;
    playbackErrors.lastStartOver = startOver;
    const requestedId = seriesId;
    playbackErrors.clearError();

    const found = await findSource(shown, episode);
    // The route moved to another series while the sources were loading.
    if (seriesId !== requestedId) return;
    if ('error' in found) {
      playbackErrors.error = found.error;
      return;
    }

    const ok = await player.play(found.magnet, {
      ...episodePlayOptions(shown, episode, found.fileIdx),
      startOver
    });

    // The route moved to another series while the stream was being prepared.
    if (seriesId !== requestedId) return;
    if (!ok && player.error) playbackErrors.setError(player.error, player.errorAction);
  }

  async function moveTo(
    ref: EpisodeRef,
    run: typeof player.advance,
    startOver: boolean
  ): Promise<void> {
    const episode = series?.videos.find((v) => sameEpisode(v, ref));
    if (!series || !episode) return;
    const shown = series;
    const requestedId = seriesId;
    playbackErrors.clearError();
    advancingTo = episode;
    const ok = await run(async (): Promise<NextPlaybackResult> => {
      // Set only after the release, so the left file's clock never counts as the next one's.
      lastAttemptedEpisode = episode;
      playbackErrors.lastStartOver = startOver;
      const found = await findSource(shown, episode);
      if (seriesId !== requestedId) return null;
      if ('error' in found) return found;
      return {
        magnet: found.magnet,
        options: { ...episodePlayOptions(shown, episode, found.fileIdx), startOver }
      };
    });
    advancingTo = null;
    if (seriesId !== requestedId) return;
    if (!ok && player.error) playbackErrors.setError(player.error, player.errorAction);
  }

  function advanceTo(ref: EpisodeRef) {
    return moveTo(ref, player.advance, false);
  }

  /** Picked from the list while watching: the episode left behind is neither finished nor watched. */
  function switchEpisode(episode: Episode, startOver = false) {
    if (lastAttemptedEpisode && sameEpisode(lastAttemptedEpisode, episode) && !startOver) return;
    upNext.cancel();
    return moveTo(episode, player.switchTo, startOver);
  }

  function handleErrorAction(action: ErrorAction) {
    playbackErrors.handleAction(action, {
      onOtherSource: () => {
        if (lastAttemptedEpisode) {
          playbackErrors.failedSources.add(currentSource);
          playEpisode(lastAttemptedEpisode, playbackErrors.lastStartOver);
        }
      },
      onRetry: () => {
        if (lastAttemptedEpisode) {
          playEpisode(lastAttemptedEpisode, playbackErrors.lastStartOver);
        }
      }
    });
  }
</script>

{#snippet episodePanel(close: () => void)}
  {#if series}
    <EpisodeList
      {seriesId}
      episodes={series.videos}
      {translatedEpisodes}
      bind:selectedSeason
      onPlayEpisode={(episode, startOver) => {
        close();
        void switchEpisode(episode, startOver);
      }}
      focusEpisode={preparingEpisode}
      playing
      showPreferences={false}
    />
  {/if}
{/snippet}

{#if playbackErrors.error}
  <ErrorNotice error={playbackErrors.error} onaction={handleErrorAction} />
{:else if series && autoplayPending && !player.isPlaying}
  <LoadingIndicator label="Carregando..." />
{:else if series}
  {#if (series.background_image_original || series.background_image) && !player.isPlaying}
    <MediaBackdrop
      src={series.background_image_original || series.background_image}
      opacityClass="opacity-50"
    />
  {/if}

  <div class="relative z-10 flex flex-col gap-8 lg:flex-row">
    <div class="w-full max-w-[240px] lg:w-1/4 xl:max-w-[280px] 2xl:max-w-sm">
      <img
        src={series.large_cover_image}
        alt={series.title}
        class="h-auto w-full rounded-sm object-cover shadow-lg"
      />
    </div>

    <div class="w-full lg:w-1/2">
      {#if player.isPlaying}
        <Player
          {backend}
          bind:videoElement
          loadingStage={player.loadingStage}
          downloadPercent={player.downloadPercent}
          upNext={upNextCard}
          title={translated.title || series.title}
          episodeLabel={preparingEpisode ? episodeLabel(preparingEpisode) : ''}
          episodeName={preparingEpisode ? episodeName(preparingEpisode) : ''}
          {episodePanel}
          onclose={() => {
            player.stop();
          }}
        />
      {:else}
        <MediaInfo
          id={series.id}
          type="series"
          poster={series.medium_cover_image}
          title={translated.title || series.title}
          year={series.year}
          director={series.director}
          rating={series.rating}
          synopsis={translated.synopsis}
          cast={series.cast}
          genres={series.genres}
          runtime={series.runtime}
          trailerYoutubeId={series.trailerYoutubeId}
        />
      {/if}
    </div>

    <!-- Episodes Right Column -->
    <div class="w-full lg:w-1/4">
      {#if !player.isPlaying}
        <EpisodeList
          {seriesId}
          episodes={series.videos}
          {translatedEpisodes}
          bind:selectedSeason
          onPlayEpisode={playEpisode}
          originalLanguage={series.language}
          {focusEpisode}
        />
      {/if}
    </div>
  </div>
  {#if !player.isPlaying && similarRow}
    <div class="relative z-10 mt-12">
      {#key series.id}
        <LazyCatalogRow row={similarRow} excludeId={series.id} />
      {/key}
    </div>
  {/if}
{/if}
