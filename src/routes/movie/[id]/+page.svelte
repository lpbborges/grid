<script lang="ts">
  import { logger } from '$lib/logger';
  import { translateMediaInfo } from '$lib/api/translate';
  import { getMovieStreams } from '$lib/api/torrentio';
  import VideoPlayer from '$lib/components/VideoPlayer.svelte';
  import MediaInfo from '$lib/components/MediaInfo.svelte';
  import PlayerSelection from '$lib/components/PlayerSelection.svelte';
  import { useStreamPlayer } from '$lib/composables/useStreamPlayer.svelte';
  import { watchedStore } from '$lib/stores/watched.svelte';
  import { progressStore } from '$lib/stores/progress.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';

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

  $effect(() => {
    if (movieId) {
      selectedTorrentHash = '';
      combinedTorrents = [];
      streamPlayer.stop();
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

  let combinedTorrents = $state<any[]>([]);

  $effect(() => {
    if (movie && movie.id) {
      if (combinedTorrents.length === 0) {
        combinedTorrents = [...(movie.torrents || [])];
        getMovieStreams(movie.id.toString()).then((streams) => {
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

              const sizeMatch = s.title?.match(/💾\\s*([^⚙]+)/);
              const size = sizeMatch ? sizeMatch[1].trim() : 'Unknown size';

              return {
                hash: s.infoHash,
                quality,
                type,
                size,
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
        });
      }
    }
  });

  function reselectBestTorrent() {
    if (combinedTorrents.length > 0) {
      const getScore = (t: any) => {
        let score = 0;
        const text = (
          (t.rawStream?.title || '') +
          ' ' +
          (t.rawStream?.name || '') +
          ' ' +
          t.type
        ).toLowerCase();

        if (t.quality === settingsStore.quality) score += 100;

        const wantPt = settingsStore.audio === 'pt';
        const wantOriginal = settingsStore.audio === 'original';

        const isDubbedOnly = text.includes('dublado') && !text.includes('dual');
        const isDual = text.includes('dual audio') || text.includes('multi-audio');
        const hasPt =
          isDubbedOnly ||
          isDual ||
          text.includes('pt-br') ||
          text.includes('🇧🇷') ||
          t.type.includes('(pt)');

        if (wantPt) {
          if (hasPt) score += 500;
          else score += 10;
        } else if (wantOriginal) {
          if (isDubbedOnly) score -= 500;
          else score += 500;
        } else {
          if (!isDubbedOnly) score += 100;
        }

        return score + (t.seeds || 0);
      };

      const sorted = [...combinedTorrents].sort((a, b) => getScore(b) - getScore(a));
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

    const ok = await streamPlayer.play(magnet, { mediaId: movieId, fileIdx });
    if (!ok) {
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
      class="group hover:text-accent-green text-main flex w-fit items-center gap-2 text-sm font-bold tracking-wider uppercase transition-colors"
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
        class="text-primary group-hover:text-accent-green transition-colors"
        ><path d="m15 18-6-6 6-6" /></svg
      >
      Voltar ao Catálogo
    </a>
  </div>
{/if}

{#if error}
  <div
    class="border-accent-orange text-accent-orange bg-surface/80 flex flex-col items-start gap-3 border-l-4 p-4 font-mono"
  >
    <span>{error}</span>
    <button
      onclick={retry}
      class="border-accent-orange text-accent-orange hover:bg-accent-orange hover:text-dark w-fit rounded border px-4 py-2 text-xs font-bold tracking-widest uppercase transition-colors"
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
