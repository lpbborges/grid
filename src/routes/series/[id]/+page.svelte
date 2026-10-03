<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { logger } from '$lib/logger';
  import { translateMediaInfo, translateEpisodesList } from '$lib/api/translate';
  import Player from '$lib/components/Player.svelte';
  import LoadingIndicator from '$lib/components/LoadingIndicator.svelte';
  import MediaInfo from '$lib/components/MediaInfo.svelte';
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
  import type { ErrorAction, PageError } from '$lib/utils/pageError';

  let { data } = $props();
  let seriesId = $derived(data.seriesId);
  let series = $derived(data.series);
  let error = $state<PageError | null>(null);
  let similarRow = $derived(series ? similarTitlesRow('series', series.genres) : null);
  let lastAttemptedEpisode = $state<Episode | null>(null);
  let lastStartOver = false;
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

  let translatedTitle = $state('');
  let translatedSynopsis = $state('');

  let selectedSeason = $state<number | null>(null);
  let translatedEpisodes = $state<Record<string, string>>({});

  $effect(() => {
    if (data.error) {
      logger.error('Falha ao carregar série:', data.error);
      error = { message: 'Não foi possível carregar este título.', action: 'reload' };
    } else if (seriesId) {
      error = null;
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
    if (series) {
      const currentTitle = series.title;
      const currentSynopsis = series.description_full || series.summary;

      translatedTitle = currentTitle;
      translatedSynopsis = currentSynopsis || 'Nenhuma sinopse disponível.';

      translateMediaInfo(currentTitle, currentSynopsis).then((res) => {
        if (series && series.title === currentTitle) {
          translatedTitle = res.title;
          translatedSynopsis = res.synopsis;
        }
      });
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
          title: translatedTitle || shown.title,
          poster: shown.medium_cover_image
        },
        next: nextEpisode(shown.videos, episode)
      }
    };
  }

  // Sources that failed for the episode being tried; "Tentar outra fonte" skips them.
  let failedSources = new SvelteSet<string>();
  let failedSourcesFor = '';
  let currentSource = '';

  async function findSource(shown: Series, episode: Episode) {
    const key = `${seriesId}:${episodeLabel(episode)}`;
    if (key !== failedSourcesFor) {
      failedSources = new SvelteSet();
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
      failedSources
    );
    if (!('error' in found)) currentSource = found.infoHash;
    return found;
  }

  function playbackError(): PageError {
    return { message: player.error, action: player.errorAction };
  }

  async function playEpisode(episode: Episode, startOver = false) {
    if (typeof window === 'undefined' || !series) return;
    const shown = series;

    lastAttemptedEpisode = episode;
    lastStartOver = startOver;
    const requestedId = seriesId;
    error = null;

    const found = await findSource(shown, episode);
    // The route moved to another series while the sources were loading.
    if (seriesId !== requestedId) return;
    if ('error' in found) {
      error = found.error;
      return;
    }

    const ok = await player.play(found.magnet, {
      ...episodePlayOptions(shown, episode, found.fileIdx),
      startOver
    });

    // The route moved to another series while the stream was being prepared.
    if (seriesId !== requestedId) return;
    if (!ok && player.error) error = playbackError();
  }

  async function advanceTo(ref: EpisodeRef) {
    const episode = series?.videos.find((v) => sameEpisode(v, ref));
    if (!series || !episode) return;
    const shown = series;
    const requestedId = seriesId;
    error = null;
    advancingTo = episode;
    const ok = await player.advance(async (): Promise<NextPlaybackResult> => {
      // Set only after the release, so the finished file's clock never counts as the next one's.
      lastAttemptedEpisode = episode;
      lastStartOver = false;
      const found = await findSource(shown, episode);
      if (seriesId !== requestedId) return null;
      if ('error' in found) return found;
      return { magnet: found.magnet, options: episodePlayOptions(shown, episode, found.fileIdx) };
    });
    advancingTo = null;
    if (seriesId !== requestedId) return;
    if (!ok && player.error) error = playbackError();
  }

  function handleErrorAction(action: ErrorAction) {
    if (action === 'reload') {
      window.location.reload();
      return;
    }
    if (action === 'back' || !lastAttemptedEpisode) {
      error = null;
      return;
    }
    if (action === 'otherSource') failedSources.add(currentSource);
    playEpisode(lastAttemptedEpisode, lastStartOver);
  }
</script>

{#if error}
  <ErrorNotice {error} onaction={handleErrorAction} />
{:else if series && autoplayPending && !player.isPlaying}
  <LoadingIndicator label="Carregando..." />
{:else if series}
  {#if (series.background_image_original || series.background_image) && !player.isPlaying}
    <div class="pointer-events-none fixed inset-0">
      <img
        src={series.background_image_original || series.background_image}
        class="h-full w-full object-cover opacity-50"
        alt=""
      />
      <div class="from-dark via-dark/80 absolute inset-0 bg-gradient-to-t to-transparent"></div>
      <div class="from-dark via-dark/80 absolute inset-0 bg-gradient-to-r to-transparent"></div>
    </div>
  {/if}

  <div class="relative z-10 flex flex-col gap-8 lg:flex-row">
    <div class="w-full max-w-[240px] lg:w-1/4 xl:max-w-[280px] 2xl:max-w-sm">
      <img
        src={series.large_cover_image}
        alt={series.title}
        class="h-auto w-full rounded object-cover shadow-lg"
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
          title={translatedTitle || series.title}
          episodeLabel={preparingEpisode ? episodeLabel(preparingEpisode) : ''}
          episodeName={preparingEpisode ? episodeName(preparingEpisode) : ''}
          onclose={() => {
            player.stop();
          }}
        />
      {:else}
        <MediaInfo
          id={series.id}
          type="series"
          poster={series.medium_cover_image}
          title={translatedTitle || series.title}
          year={series.year}
          director={series.director}
          rating={series.rating}
          synopsis={translatedSynopsis}
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
