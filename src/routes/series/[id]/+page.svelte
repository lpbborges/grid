<script lang="ts">
  import { prepareStream } from '$lib/engine/orchestrator';
  import { translateMediaInfo, translateEpisodesList } from '$lib/api/translate';
  import { getSeriesStreams } from '$lib/api/torrentio';
  import { clearTorrents } from '$lib/engine/torrent';
  import type { SubtitleTrack } from '$lib/api/subtitles';
  import VideoPlayer from '$lib/components/VideoPlayer.svelte';
  import MediaInfo from '$lib/components/MediaInfo.svelte';
  import EpisodeList from '$lib/components/EpisodeList.svelte';
  import { playerState } from '$lib/stores.svelte';

  let { data } = $props();
  let seriesId = $derived(data.seriesId);
  let series = $derived(data.series);
  let error = $state('');

  let isPlaying = $state(false);
  let videoSrc = $state('');
  let subtitles = $state<SubtitleTrack[]>([]);
  let engineStatus = $state('');
  let preferredQuality = $state('1080p');

  let selectedInfoHash = $state('');
  let selectedTotalBytes = $state(0);

  let translatedTitle = $state('');
  let translatedSynopsis = $state('');

  let selectedSeason = $state<number | null>(null);
  let translatedEpisodes = $state<Record<string, string>>({});

  $effect(() => {
    if (data.error) error = data.error;
    else if (seriesId) error = '';
  });

  $effect(() => {
    if (seriesId) {
      isPlaying = false;
      playerState.isPlaying = false;
      videoSrc = '';
      selectedInfoHash = '';
      selectedTotalBytes = 0;
      engineStatus = '';
      selectedSeason = null;
      translatedEpisodes = {};
      clearTorrents().catch(console.error);
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
      const episodesToTranslate = series.videos.filter((v: any) => v.season === selectedSeason);
      if (episodesToTranslate.length > 0) {
        translateEpisodesList(episodesToTranslate).then((res) => {
          translatedEpisodes = { ...translatedEpisodes, ...res };
        });
      }
    }
  });

  async function playEpisode(episode: any) {
    if (typeof window === 'undefined') return;

    try {
      error = '';
      engineStatus = 'Buscando fontes disponíveis...';
      const streams = await getSeriesStreams(seriesId, episode.season, episode.episode);

      if (!streams || streams.length === 0) {
        error = 'Nenhuma fonte encontrada para este episódio.';
        engineStatus = '';
        return;
      }

      let bestStream = streams.find(
        (s) =>
          (s.title?.toLowerCase().includes(preferredQuality) ||
            s.name?.toLowerCase().includes(preferredQuality)) &&
          s.infoHash
      );

      if (!bestStream) {
        bestStream = streams.find((s) => s.infoHash);
      }

      if (!bestStream || !bestStream.infoHash) {
        error = 'Fonte incompatível (sem infoHash).';
        engineStatus = '';
        return;
      }

      const magnet = `magnet:?xt=urn:btih:${bestStream.infoHash}&dn=${encodeURIComponent(`${series.title} S${episode.season}E${episode.episode}`)}`;

      isPlaying = true;
      playerState.isPlaying = true;

      const streamData = await prepareStream(
        magnet,
        (status) => {
          engineStatus = status;
        },
        seriesId,
        episode.season,
        episode.episode,
        bestStream.fileIdx
      );

      selectedInfoHash = streamData.infoHash;
      selectedTotalBytes = streamData.totalBytes;
      videoSrc = streamData.videoSrc;
      subtitles = streamData.subtitles;
    } catch (e: any) {
      error = `Erro de reprodução: ${e.message}`;
      isPlaying = false;
      playerState.isPlaying = false;
      engineStatus = '';
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
{:else if series}
  {#if series.background_image_original || series.background_image}
    <div class="pointer-events-none fixed inset-0">
      <img
        src={series.background_image_original || series.background_image}
        class="h-full w-full object-cover opacity-50"
        alt=""
      />
      <div class="from-dark via-dark/80 absolute inset-0 bg-gradient-to-t to-transparent"></div>
      <div class="from-dark/90 via-dark/40 absolute inset-0 bg-gradient-to-r to-transparent"></div>
    </div>
  {/if}

  <div class="relative z-10 flex flex-col gap-8 lg:flex-row">
    <div class="w-full max-w-sm lg:w-1/4">
      <div class="border-primary/30 bg-surface/40 rounded border p-2">
        <img
          src={series.large_cover_image}
          alt={series.title}
          class="h-auto w-full rounded object-cover shadow-lg"
        />
      </div>
    </div>

    <div class="w-full lg:w-1/2">
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
          year={series.year}
          director={series.director}
          rating={series.rating}
          synopsis={translatedSynopsis}
          cast={series.cast}
        />
      {/if}
    </div>

    <!-- Episodes Right Column -->
    <div class="w-full lg:w-1/4">
      {#if !isPlaying}
        <EpisodeList
          episodes={series.videos}
          {translatedEpisodes}
          bind:selectedSeason
          bind:preferredQuality
          onPlayEpisode={playEpisode}
        />
      {/if}
    </div>
  </div>
{/if}
