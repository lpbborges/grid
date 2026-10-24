<script lang="ts">
  import { untrack } from 'svelte';
  import { logger } from '$lib/logger';
  import { buildMagnet, getMovieStreams } from '$lib/api/torrentio';
  import { streamOption, type StreamOption } from '$lib/engine/streamOption';
  import Player from '$lib/components/Player.svelte';
  import LoadingIndicator from '$lib/components/LoadingIndicator.svelte';
  import MediaInfo from '$lib/components/MediaInfo.svelte';
  import MediaBackdrop from '$lib/components/MediaBackdrop.svelte';
  import PlayerSelection from '$lib/components/PlayerSelection.svelte';
  import ErrorNotice from '$lib/components/ErrorNotice.svelte';
  import LazyCatalogRow from '$lib/components/LazyCatalogRow.svelte';
  import { similarTitlesRow } from '$lib/utils/catalogRows';
  import { usePlayer } from '$lib/composables/usePlayer.svelte';
  import { useTranslatedMedia } from '$lib/composables/useTranslatedMedia.svelte';
  import { usePlaybackErrors } from '$lib/composables/usePlaybackErrors.svelte';

  import { settingsStore } from '$lib/stores/settings.svelte';
  import { watchedStore } from '$lib/stores/watched.svelte';
  import { progressStore } from '$lib/stores/progress.svelte';
  import { resumeSeconds } from '$lib/utils/resume';
  import { rankStreamOptions } from '$lib/engine/ranking';
  import type { Movie } from '$lib/types';
  import type { ErrorAction } from '$lib/utils/pageError';

  let { data } = $props();
  let movieId = $derived(data.movieId);
  let movie = $derived(data.movie);
  let resumeAt = $derived(resumeSeconds(progressStore.get(movieId)));
  const playbackErrors = usePlaybackErrors();
  let similarRow = $derived(movie ? similarTitlesRow('movie', movie.genres) : null);
  // Set when the source lookup itself failed, so "Tentar novamente" repeats it.
  let lookupFailed = false;

  let videoElement = $state<HTMLVideoElement | null>(null);
  const player = usePlayer(() => videoElement, {
    onwatched: () => watchedStore.add(movieId)
  });
  const backend = player.backend;

  $effect(() => {
    if (data.error) {
      logger.error('Falha ao carregar filme:', data.error);
      playbackErrors.setError('Não foi possível carregar este título.', 'reload');
    } else if (movieId) {
      playbackErrors.clearError();
    }
  });

  let selectedTorrentHash = $state('');
  let sourcesLoaded = $state(false);
  let autoplayStarted = false;
  let autoplayPending = $state(untrack(() => data.autoplay));

  const translated = useTranslatedMedia(() => movie);

  // Only stop an in-progress stream when movieId actually changes (navigating
  // to a different movie) — not on the initial mount, when there is nothing
  // to stop yet. Calling stop() unconditionally on mount let this effect race
  // with an immediate play() click (see the video-cache feature's Task 9).
  let hasMountedTorrentEffect = false;
  $effect(() => {
    if (movieId) {
      selectedTorrentHash = '';
      sourcesLoaded = false;
      autoplayStarted = false;
      autoplayPending = untrack(() => data.autoplay);
      combinedTorrents = [];
      playbackErrors.failedSources.clear();
      if (hasMountedTorrentEffect) {
        untrack(() => player.stop());
      }
      hasMountedTorrentEffect = true;
    }
  });

  let combinedTorrents = $state<StreamOption[]>([]);

  $effect(() => {
    if (movie && movie.id && untrack(() => combinedTorrents.length) === 0) {
      combinedTorrents = [...(movie.torrents || [])];
      loadSources(movie);
    }
  });

  function loadSources(target: Movie) {
    const requestedId = target.id;
    getMovieStreams(requestedId.toString(), {
      audio: settingsStore.audio,
      subtitle: settingsStore.subtitle
    })
      .then((streams) => {
        if (movie?.id !== requestedId) return;
        const torrentioOptions = streams.map(streamOption).filter((t) => t.hash);

        const existingHashes: Record<string, boolean> = {};
        for (const t of combinedTorrents) if (t.hash) existingHashes[t.hash] = true;
        let changed = false;
        for (const opt of torrentioOptions) {
          if (!existingHashes[opt.hash]) {
            combinedTorrents.push(opt);
            existingHashes[opt.hash] = true;
            changed = true;
          }
        }
        if (changed) reselectBestTorrent();
        sourcesLoaded = true;
      })
      .catch((e) => {
        if (movie?.id !== requestedId) return;
        sourcesLoaded = true;
        logger.error('Falha ao buscar streams do Torrentio:', e);
        if (combinedTorrents.length === 0) {
          lookupFailed = true;
          playbackErrors.setError(
            'Não foi possível buscar este filme. Verifique sua conexão.',
            'retry'
          );
        }
      });
  }

  /** Selects the best ranked source that has not failed; false when none is left. */
  function reselectBestTorrent(): boolean {
    const candidates = combinedTorrents.filter((t) => !playbackErrors.failedSources.has(t.hash));
    if (candidates.length > 0) {
      const sorted = rankStreamOptions(
        candidates,
        (t) => ({
          quality: t.quality,
          text: (
            (t.rawStream?.title || '') +
            ' ' +
            (t.rawStream?.name || '') +
            ' ' +
            t.type
          ).toLowerCase(),
          seeds: t.seeds || 0
        }),
        { quality: settingsStore.quality, audioPreference: settingsStore.audio }
      );
      selectedTorrentHash = sorted[0].hash;
      return true;
    }
    return false;
  }

  $effect(() => {
    if (settingsStore.audio || settingsStore.quality) {
      if (combinedTorrents.length > 0) {
        reselectBestTorrent();
      }
    }
  });

  // The hover card's Play opens the page with ?play=1: start once the sources are in.
  $effect(() => {
    if (data.autoplay && movie && sourcesLoaded && !autoplayStarted) {
      autoplayStarted = true;
      untrack(() => void playMovie().finally(() => (autoplayPending = false)));
    }
  });

  async function playMovie(startOver = false) {
    playbackErrors.lastStartOver = startOver;
    playbackErrors.clearError();
    if (!movie || combinedTorrents.length === 0) {
      playbackErrors.setError('Este filme ainda não está disponível para assistir.', 'back');
      return;
    }

    const selectedTorrent =
      combinedTorrents.find((t) => t.hash === selectedTorrentHash) || combinedTorrents[0];
    const fileIdx = selectedTorrent.rawStream?.fileIdx;
    const magnet = buildMagnet(
      selectedTorrent.hash,
      movie.title,
      selectedTorrent.rawStream?.sources
    );

    const requestedId = movieId;
    const ok = await player.play(magnet, {
      mediaId: movieId,
      fileIdx,
      originalLanguage: movie.language,
      startOver,
      progress: {
        meta: {
          type: 'movie',
          title: translated.title || movie.title,
          poster: movie.medium_cover_image
        }
      }
    });
    // The route moved to another title while the stream was being prepared.
    if (movieId !== requestedId) return;
    if (!ok && player.error) playbackErrors.setError(player.error, player.errorAction);
  }

  function tryAnotherSource() {
    playbackErrors.failedSources.add(selectedTorrentHash);
    if (reselectBestTorrent()) {
      playMovie(playbackErrors.lastStartOver);
    } else {
      playbackErrors.setError('Não encontramos outra fonte que funcione para este filme.', 'back');
    }
  }

  function handleErrorAction(action: ErrorAction) {
    playbackErrors.handleAction(action, {
      onOtherSource: tryAnotherSource,
      onRetryLookup: () => {
        if (lookupFailed && movie) {
          lookupFailed = false;
          playbackErrors.clearError();
          loadSources(movie);
        } else {
          playMovie(playbackErrors.lastStartOver);
        }
      },
      onRetry: () => playMovie(playbackErrors.lastStartOver)
    });
  }
</script>

{#if playbackErrors.error}
  <ErrorNotice error={playbackErrors.error} onaction={handleErrorAction} />
{:else if movie && autoplayPending && !player.isPlaying}
  <LoadingIndicator label="Carregando..." />
{:else if movie}
  {#if (movie.background_image_original || movie.background_image) && !player.isPlaying}
    <MediaBackdrop src={movie.background_image_original || movie.background_image} />
  {/if}

  <div class="relative z-10 flex flex-col gap-8 lg:flex-row">
    <div class="w-full max-w-[240px] lg:w-1/4 xl:max-w-[280px] 2xl:max-w-sm">
      <img
        src={movie.large_cover_image}
        alt={movie.title}
        class="h-auto w-full rounded-sm object-cover shadow-lg"
      />

      {#if !player.isPlaying}
        <PlayerSelection
          torrents={combinedTorrents}
          bind:selectedTorrentHash
          onPlay={playMovie}
          resumeSeconds={resumeAt}
          originalLanguage={movie.language}
        />
      {/if}
    </div>

    <div class="w-full lg:w-3/4">
      {#if player.isPlaying}
        <Player
          {backend}
          bind:videoElement
          loadingStage={player.loadingStage}
          downloadPercent={player.downloadPercent}
          title={translated.title || movie.title}
          onclose={() => {
            player.stop();
          }}
        />
      {:else}
        <MediaInfo
          id={movie.id}
          type="movie"
          poster={movie.medium_cover_image}
          title={translated.title || movie.title}
          year={movie.year}
          director={movie.director}
          rating={movie.rating}
          synopsis={translated.synopsis}
          cast={movie.cast}
          genres={movie.genres}
          runtime={movie.runtime}
          trailerYoutubeId={movie.trailerYoutubeId}
        />
      {/if}
    </div>
  </div>
  {#if !player.isPlaying && similarRow}
    <div class="relative z-10 mt-12">
      {#key movie.id}
        <LazyCatalogRow row={similarRow} excludeId={movie.id} />
      {/key}
    </div>
  {/if}
{/if}
