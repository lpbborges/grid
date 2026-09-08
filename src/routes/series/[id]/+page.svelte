<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getSeriesDetails } from '$lib/api/yts';
  import { translateText } from '$lib/api/translate';
  import { getSeriesStreams } from '$lib/api/torrentio';
  import {
    startEngine,
    waitForEngine,
    clearTorrents,
    addTorrent,
    getBestVideoFileIndex,
    getStreamUrl,
    getTorrentSubtitles
  } from '$lib/engine/torrent';
  import VideoPlayer from '$lib/components/VideoPlayer.svelte';
  import { getExternalSubtitles, type SubtitleTrack } from '$lib/api/subtitles';

  let seriesId = $page.params.id as string;
  let series = $state<any>(null);
  let loading = $state(true);
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

  let availableSeasons = $derived(
    series?.videos ? Array.from(new Set(series.videos.map((v: any) => v.season))) : []
  );
  let selectedSeason = $state<number | null>(null);

  let filteredEpisodes = $derived(
    series?.videos ? series.videos.filter((v: any) => v.season === selectedSeason) : []
  );

  $effect(() => {
    if (availableSeasons.length > 0 && selectedSeason === null) {
      selectedSeason = availableSeasons[0] as number;
    }
  });

  onMount(async () => {
    try {
      series = await getSeriesDetails(seriesId);
      translatedTitle = series.title;
      translatedSynopsis =
        series.description_full || series.summary || 'Nenhuma sinopse disponível.';

      if (typeof window !== 'undefined' && window.navigator) {
        const userLang = window.navigator.language || 'en';
        if (!userLang.startsWith('en')) {
          const targetLang = userLang.split('-')[0];
          translateText(series.title, targetLang).then((res) => {
            if (res) translatedTitle = res;
          });
          if (series.description_full || series.summary) {
            translateText(series.description_full || series.summary, targetLang).then((res) => {
              if (res) translatedSynopsis = res;
            });
          }
        }
      }
    } catch (e: any) {
      error = e.message || 'Erro ao carregar série';
    } finally {
      loading = false;
    }
  });

  let translatedEpisodes = $state<Record<string, string>>({});

  $effect(() => {
    if (typeof window !== 'undefined' && window.navigator && filteredEpisodes.length > 0) {
      const userLang = window.navigator.language || 'en';
      if (!userLang.startsWith('en')) {
        const targetLang = userLang.split('-')[0];
        filteredEpisodes.forEach((ep: any) => {
          if (ep.name && !translatedEpisodes[ep.id]) {
            translatedEpisodes[ep.id] = ep.name; // mark as translating
            translateText(ep.name, targetLang).then((res) => {
              if (res) {
                translatedEpisodes[ep.id] = res;
              }
            });
          }
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
      engineStatus = 'Iniciando player...';

      await startEngine();
      await waitForEngine();

      engineStatus = 'Preparando stream...';
      await clearTorrents();
      const details = await addTorrent(magnet);

      selectedInfoHash = details.info_hash;
      selectedTotalBytes = details.files.reduce((acc, f) => acc + f.length, 0);

      let bestFileIdx = bestStream.fileIdx;
      if (bestFileIdx === undefined) {
        bestFileIdx = getBestVideoFileIndex(details.files);
      }

      const tSubs = getTorrentSubtitles(details.info_hash, details.files);

      engineStatus = 'Baixando legendas...';
      const eSubs = seriesId
        ? await getExternalSubtitles(seriesId, episode.season, episode.episode)
        : [];

      engineStatus = 'Pronto para assistir.';
      subtitles = [...tSubs, ...eSubs];
      videoSrc = getStreamUrl(details.info_hash, bestFileIdx);
    } catch (e: any) {
      error = `Erro de reprodução: ${e.message}`;
      engineStatus = '';
      isPlaying = false;
    }
  }

  async function stopPlaying() {
    isPlaying = false;
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

{#if loading}
  <div class="flex justify-center py-20">
    <div class="text-accent-green animate-pulse font-mono text-xl tracking-widest uppercase">
      Carregando Dados...
    </div>
  </div>
{:else if error}
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
        <h1
          class="text-main mb-2 text-4xl font-bold tracking-tight md:text-5xl"
          style="text-shadow: 0 0 10px rgba(255,255,255,0.2);"
        >
          {translatedTitle}
        </h1>

        <div class="text-primary mb-6 flex flex-wrap gap-4 font-mono text-sm">
          <span class="border-primary/50 bg-surface rounded border px-3 py-1"
            >ANO: {series.year}</span
          >
          {#if series.director && series.director.length > 0}
            <span class="border-primary/50 bg-surface rounded border px-3 py-1"
              >DIRETOR: {series.director.join(', ')}</span
            >
          {/if}
          <span
            class="border-primary/50 bg-surface flex items-center gap-1 rounded border px-3 py-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="text-yellow-400"
              ><polygon
                points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
              /></svg
            >
            IMDB: {series.rating}
          </span>
        </div>

        <div class="prose prose-invert text-muted mb-8 max-w-none leading-relaxed">
          <h3
            class="text-accent-green border-primary/30 mb-4 border-b pb-2 text-sm font-bold tracking-widest uppercase"
          >
            Sinopse
          </h3>
          <p>{translatedSynopsis}</p>
        </div>

        {#if series.cast && series.cast.length > 0}
          <div class="mb-8">
            <h3
              class="text-primary border-primary/30 mb-4 border-b pb-2 text-sm font-bold tracking-widest uppercase"
            >
              Elenco
            </h3>
            <div class="flex snap-x gap-4 overflow-x-auto pb-4">
              {#each series.cast as actor}
                <div class="flex w-32 flex-none snap-start flex-col items-center text-center">
                  {#if actor.url_small_image}
                    <img
                      src={actor.url_small_image}
                      alt={actor.name}
                      class="border-primary/50 mb-2 h-16 w-16 rounded-full border-2 object-cover"
                    />
                  {:else}
                    <div
                      class="border-primary/50 bg-surface text-muted mb-2 flex h-16 w-16 items-center justify-center rounded-full border-2"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        ><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle
                          cx="12"
                          cy="7"
                          r="4"
                        /></svg
                      >
                    </div>
                  {/if}
                  <span class="text-main text-sm leading-tight font-bold" title={actor.name}
                    >{actor.name}</span
                  >
                  <span
                    class="text-accent-green mt-1 text-xs leading-tight"
                    title={actor.character_name}>{actor.character_name}</span
                  >
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/if}
    </div>

    <!-- Episodes Right Column -->
    <div class="w-full lg:w-1/4">
      {#if series.videos && series.videos.length > 0}
        <div class="flex flex-col gap-4">
          <div class="border-primary/30 flex flex-col gap-3 border-b pb-3">
            <h3 class="text-primary text-sm font-bold tracking-widest uppercase">Episódios</h3>
            <div class="flex items-center gap-2">
              <div class="relative w-1/2">
                <select
                  bind:value={selectedSeason}
                  class="border-primary/50 focus:border-accent-green bg-surface text-main w-full appearance-none rounded border py-1 pr-6 pl-2 font-mono text-xs focus:outline-none"
                >
                  {#each availableSeasons as season}
                    <option value={season} class="bg-surface text-main">Temp. {season}</option>
                  {/each}
                </select>
                <div
                  class="text-primary pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg
                  >
                </div>
              </div>
              <div class="relative w-1/2">
                <select
                  bind:value={preferredQuality}
                  class="border-primary/50 focus:border-accent-green bg-surface text-main w-full appearance-none rounded border py-1 pr-6 pl-2 font-mono text-xs focus:outline-none"
                >
                  <option value="4k" class="bg-surface text-main">4K</option>
                  <option value="1080p" class="bg-surface text-main">1080p</option>
                  <option value="720p" class="bg-surface text-main">720p</option>
                  <option value="480p" class="bg-surface text-main">480p</option>
                </select>
                <div
                  class="text-primary pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg
                  >
                </div>
              </div>
            </div>
          </div>

          <div
            class="scrollbar-thumb-primary/50 flex max-h-[600px] scrollbar-thin flex-col gap-2 overflow-y-auto pr-2"
          >
            {#each filteredEpisodes as episode}
              <button
                class="hover:border-accent-green border-primary/30 bg-surface/40 hover:bg-surface/60 flex items-center justify-between rounded border p-3 text-left transition-all hover:shadow-[0_0_10px_rgba(91,255,59,0.2)]"
                onclick={() => playEpisode(episode)}
              >
                <div class="flex flex-col">
                  <span class="text-main text-sm font-bold">
                    {episode.episode}. {translatedEpisodes[episode.id] ||
                      episode.name ||
                      `Episódio ${episode.episode}`}
                  </span>
                  {#if episode.firstAired}
                    <span class="text-muted text-xs">
                      Lançado em: {new Date(episode.firstAired).toLocaleDateString('pt-BR')}
                    </span>
                  {/if}
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="text-primary hover:text-accent-green shrink-0 transition-colors"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
