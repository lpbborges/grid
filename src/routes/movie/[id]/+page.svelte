<script lang="ts">
  import { untrack } from 'svelte';
  import { logger } from '$lib/logger';
  import { translateMediaInfo } from '$lib/api/translate';
  import { getMovieStreams, parseSeedCount } from '$lib/api/torrentio';
  import VideoPlayer from '$lib/components/VideoPlayer.svelte';
  import MediaInfo from '$lib/components/MediaInfo.svelte';
  import PlayerSelection from '$lib/components/PlayerSelection.svelte';
  import { useStreamPlayer } from '$lib/composables/useStreamPlayer.svelte';
  import { watchedStore } from '$lib/stores/watched.svelte';
  import { progressStore } from '$lib/stores/progress.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { rankStreamOptions } from '$lib/engine/ranking';

  let { data } = $props();
  let movieId = $derived(data.movieId);
  let movie = $derived(data.movie);
  let error = $state('');
  let errorSource = $state<'load' | 'play' | null>(null);

  const streamPlayer = useStreamPlayer();

  $effect(() => {
    if (data.error) {
      logger.error('Falha ao carregar filme:', data.error);
      error = 'Não foi possível carregar este título. Tente novamente.';
      errorSource = 'load';
    } else if (movieId) {
      error = '';
      errorSource = null;
    }
  });

  let selectedTorrentHash = $state('');

  let translatedTitle = $state('');
  let translatedSynopsis = $state('');

  // Only stop an in-progress stream when movieId actually changes (navigating
  // to a different movie) — not on the initial mount, when there is nothing
  // to stop yet. Calling stop() unconditionally on mount let this effect race
  // with an immediate play() click (see the video-cache feature's Task 9).
  let hasMountedTorrentEffect = false;
  $effect(() => {
    if (movieId) {
      selectedTorrentHash = '';
      combinedTorrents = [];
      if (hasMountedTorrentEffect) {
        streamPlayer.stop();
      }
      hasMountedTorrentEffect = true;
    }
  });

  $effect(() => {
    if (movie) {
      const currentTitle = movie.title;
      const currentSynopsis = movie.description_full || movie.summary;

      translatedTitle = currentTitle;
      translatedSynopsis = currentSynopsis || 'Nenhuma sinopse disponível.';

      translateMediaInfo(currentTitle, currentSynopsis).then((res) => {
        if (movie && movie.title === currentTitle) {
          translatedTitle = res.title;
          translatedSynopsis = res.synopsis;
        }
      });
    }
  });

  interface CombinedStreamOption {
    hash: string;
    quality: string;
    type: string;
    seeds?: number;
    peers?: number;
    url?: string;
    rawStream?: { title?: string; name?: string; fileIdx?: number; infoHash?: string };
  }

  let combinedTorrents = $state<CombinedStreamOption[]>([]);

  $effect(() => {
    if (movie && movie.id) {
      if (untrack(() => combinedTorrents.length) === 0) {
        combinedTorrents = [...(movie.torrents || [])];
        const requestedId = movie.id;
        getMovieStreams(requestedId.toString())
          .then((streams) => {
            if (movie?.id !== requestedId) return;
            const torrentioOptions = streams
              .map((s) => {
                const qualityMatch = s.name?.match(/(4k|1080p|720p|480p)/i);
                const quality = qualityMatch ? qualityMatch[1].toLowerCase() : 'unknown';

                let type = 'Torrentio';
                const titleLower = (s.title || '').toLowerCase();
                if (
                  titleLower.includes('dublado') ||
                  titleLower.includes('pt-br') ||
                  titleLower.includes('🇧🇷')
                )
                  type += ' (PT)';
                else if (titleLower.includes('dual')) type += ' (Dual)';

                return {
                  hash: s.infoHash ?? '',
                  quality,
                  type,
                  seeds: parseSeedCount(s.title),
                  rawStream: s
                };
              })
              .filter((t) => t.hash);

            const existingHashes: Record<string, boolean> = {};
            for (const t of combinedTorrents) if (t.hash) existingHashes[t.hash] = true;
            let changed = false;
            for (const opt of torrentioOptions) {
              if (opt.hash && !existingHashes[opt.hash]) {
                combinedTorrents.push(opt);
                if (opt.hash) existingHashes[opt.hash] = true;
                changed = true;
              }
            }
            if (changed) reselectBestTorrent();
          })
          .catch((e) => {
            if (movie?.id !== requestedId) return;
            logger.error('Falha ao buscar streams do Torrentio:', e);
          });
      }
    }
  });

  function reselectBestTorrent() {
    if (combinedTorrents.length > 0) {
      const sorted = rankStreamOptions(
        combinedTorrents,
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
    }
  }

  $effect(() => {
    if (settingsStore.audio || settingsStore.quality) {
      if (combinedTorrents.length > 0) {
        reselectBestTorrent();
      }
    }
  });

  async function playMovie() {
    if (combinedTorrents.length === 0) {
      error = 'Nenhum stream disponível para este título.';
      errorSource = 'load';
      return;
    }

    const selectedTorrent =
      combinedTorrents.find((t) => t.hash === selectedTorrentHash) || combinedTorrents[0];
    const fileIdx = selectedTorrent.rawStream?.fileIdx;
    const magnet = `magnet:?xt=urn:btih:${selectedTorrent.hash}&dn=${encodeURIComponent(movie?.title || '')}`;

    const requestedId = movieId;
    const ok = await streamPlayer.play(magnet, { mediaId: movieId, fileIdx });
    // The route moved to another title while the stream was being prepared.
    if (movieId !== requestedId) return;
    // A play cancelled by closing the player fails without an error.
    if (!ok && streamPlayer.error) {
      error = streamPlayer.error;
      errorSource = 'play';
    }
  }

  function retry() {
    if (errorSource === 'load') {
      window.location.reload();
    } else {
      playMovie();
    }
  }
</script>

{#if !streamPlayer.isPlaying}
  <div class="relative z-20 mb-8">
    <a
      href="/"
      class="group hover:text-green text-main flex w-fit items-center gap-2 text-sm font-bold tracking-wider uppercase transition-colors"
      style="text-shadow: 0 2px 4px rgba(0,0,0,0.8);"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-primary group-hover:text-green transition-colors"
        ><path d="m15 18-6-6 6-6" /></svg
      >
      Voltar ao Catálogo
    </a>
  </div>
{/if}

{#if error}
  <div
    class="border-orange text-orange bg-surface/80 flex flex-col items-start gap-3 border-l-4 p-4 font-mono"
  >
    <span>{error}</span>
    <button
      onclick={retry}
      class="border-orange text-orange hover:bg-orange hover:text-dark w-fit rounded border px-4 py-2 text-xs font-bold tracking-widest uppercase transition-colors"
    >
      Tentar novamente
    </button>
  </div>
{:else if movie}
  {#if movie.background_image_original || movie.background_image}
    <div class="pointer-events-none fixed inset-0">
      <img
        src={movie.background_image_original || movie.background_image}
        class="h-full w-full object-cover"
        alt=""
      />
      <div class="from-dark via-dark/80 absolute inset-0 bg-gradient-to-t to-transparent"></div>
      <div class="from-dark via-dark/80 absolute inset-0 bg-gradient-to-r to-transparent"></div>
    </div>
  {/if}

  <div class="relative z-10 flex flex-col gap-8 lg:flex-row">
    <div class="w-full max-w-sm lg:w-1/4">
      <div class="border-primary/30 bg-surface/40 rounded border p-2">
        <img
          src={movie.large_cover_image}
          alt={movie.title}
          class="h-auto w-full rounded object-cover shadow-lg"
        />
      </div>

      {#if !streamPlayer.isPlaying}
        <PlayerSelection
          torrents={combinedTorrents}
          bind:selectedTorrentHash
          onPlay={playMovie}
          originalLanguage={movie?.language}
        />
      {/if}
    </div>

    <div class="w-full lg:w-3/4">
      {#if streamPlayer.isPlaying}
        <VideoPlayer
          src={streamPlayer.videoSrc}
          subtitles={streamPlayer.subtitles}
          mediaId={movieId}
          originalLanguage={movie?.language}
          initialTime={progressStore.get(movieId)?.time || 0}
          onclose={streamPlayer.stop}
          onwatched={() => {
            watchedStore.add(movieId);
          }}
          engineStatus={streamPlayer.engineStatus}
          infoHash={streamPlayer.infoHash}
          totalBytes={streamPlayer.totalBytes}
        />
      {:else}
        <MediaInfo
          id={movie.id}
          title={translatedTitle}
          year={movie.year}
          director={movie.director}
          rating={movie.rating}
          synopsis={translatedSynopsis}
          cast={movie.cast}
        />
      {/if}
    </div>
  </div>
{/if}
