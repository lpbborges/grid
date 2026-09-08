<script lang="ts">
  import { prepareStream } from '$lib/engine/orchestrator';
  import { translateMediaInfo } from '$lib/api/translate';
  import { clearTorrents } from '$lib/engine/torrent';
  import type { SubtitleTrack } from '$lib/api/subtitles';
  import VideoPlayer from '$lib/components/VideoPlayer.svelte';
  import MediaInfo from '$lib/components/MediaInfo.svelte';
  import PlayerSelection from '$lib/components/PlayerSelection.svelte';
  import { playerState } from '$lib/stores.svelte';

  let { data } = $props();
  let movieId = $derived(data.movieId);
  let movie = $derived(data.movie);
  let error = $state('');

  $effect(() => {
    if (data.error) error = data.error;
    else if (movieId) error = '';
  });

  let isPlaying = $state(false);
  let videoSrc = $state('');
  let subtitles = $state<SubtitleTrack[]>([]);
  let engineStatus = $state('');
  let selectedTorrentHash = $state('');
  let selectedInfoHash = $state('');
  let selectedTotalBytes = $state(0);

  let translatedTitle = $state('');
  let translatedSynopsis = $state('');

  $effect(() => {
    if (movieId) {
      isPlaying = false;
      playerState.isPlaying = false;
      videoSrc = '';
      selectedInfoHash = '';
      selectedTotalBytes = 0;
      engineStatus = '';
      selectedTorrentHash = '';
      clearTorrents().catch(console.error);
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
      error = 'Nenhum stream disponível';
      return;
    }

    const selectedTorrent =
      movie.torrents.find((t: any) => t.hash === selectedTorrentHash) || movie.torrents[0];
    const magnet = `magnet:?xt=urn:btih:${selectedTorrent.hash}&dn=${encodeURIComponent(movie.title)}`;

    isPlaying = true;
    playerState.isPlaying = true;

    try {
      const streamData = await prepareStream(
        magnet,
        (status) => {
          engineStatus = status;
        },
        movieId
      );

      selectedInfoHash = streamData.infoHash;
      selectedTotalBytes = streamData.totalBytes;
      videoSrc = streamData.videoSrc;
      subtitles = streamData.subtitles;
    } catch (e: any) {
      error = `Erro de reprodução: ${e.message}`;
      engineStatus = '';
      isPlaying = false;
      playerState.isPlaying = false;
    }
  }

  async function stopPlaying() {
    isPlaying = false;
    playerState.isPlaying = false;
    videoSrc = '';
    selectedInfoHash = '';
    selectedTotalBytes = 0;
    try {
      await clearTorrents();
    } catch (e) {
      console.error('Erro ao limpar torrents', e);
    }
  }
</script>

{#if !isPlaying}
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
  <div class="border-accent-orange text-accent-orange bg-surface/80 border-l-4 p-4 font-mono">
    Erro: {error}
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
      <div class="from-dark/90 via-dark/40 absolute inset-0 bg-gradient-to-r to-transparent"></div>
    </div>
  {/if}

  <div class="relative z-10 flex flex-col gap-8 md:flex-row">
    <div class="w-full max-w-sm md:w-1/3">
      <div class="border-primary/30 bg-surface/40 rounded border p-2">
        <img
          src={movie.large_cover_image}
          alt={movie.title}
          class="h-auto w-full rounded object-cover shadow-lg"
        />
      </div>

      {#if !isPlaying}
        <PlayerSelection torrents={movie.torrents} bind:selectedTorrentHash onPlay={playMovie} />
      {/if}
    </div>

    <div class="w-full md:w-2/3">
      {#if isPlaying}
        <VideoPlayer
          src={videoSrc}
          {subtitles}
          onclose={stopPlaying}
          {engineStatus}
          infoHash={selectedInfoHash}
          totalBytes={selectedTotalBytes}
        />
      {:else}
        <MediaInfo
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
