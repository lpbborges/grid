<script lang="ts">
  import { logger } from '$lib/logger';
  import { translateMediaInfo } from '$lib/api/translate';
  import VideoPlayer from '$lib/components/VideoPlayer.svelte';
  import MediaInfo from '$lib/components/MediaInfo.svelte';
  import PlayerSelection from '$lib/components/PlayerSelection.svelte';
  import { useStreamPlayer } from '$lib/composables/useStreamPlayer.svelte';
  import { watchedStore } from '$lib/stores/watched.svelte';

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

  $effect(() => {
    if (movie && movie.torrents && movie.torrents.length > 0 && !selectedTorrentHash) {
      let bestTorrent = movie.torrents.reduce((prev: any, current: any) => {
        if (current.quality === '1080p' && prev.quality !== '1080p') return current;
        if (prev.quality === '1080p' && current.quality !== '1080p') return prev;
        return prev.seeds > current.seeds ? prev : current;
      });
      selectedTorrentHash = bestTorrent.hash;
    }
  });

  async function playMovie() {
    if (!movie || !movie.torrents || movie.torrents.length === 0) {
      error = 'Nenhum stream disponível para este título.';
      errorSource = 'load';
      return;
    }

    const selectedTorrent =
      movie.torrents.find((t: any) => t.hash === selectedTorrentHash) || movie.torrents[0];
    const magnet = `magnet:?xt=urn:btih:${selectedTorrent.hash}&dn=${encodeURIComponent(movie.title)}`;

    const ok = await streamPlayer.play(magnet, { mediaId: movieId });
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
        <PlayerSelection torrents={movie.torrents} bind:selectedTorrentHash onPlay={playMovie} />
      {/if}
    </div>

    <div class="w-full lg:w-3/4">
      {#if streamPlayer.isPlaying}
        <VideoPlayer
          src={streamPlayer.videoSrc}
          subtitles={streamPlayer.subtitles}
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
