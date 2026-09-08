<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getMovieDetails } from '$lib/api/yts';
  import { getExternalSubtitles, type SubtitleTrack } from '$lib/api/subtitles';
  import { translateText } from '$lib/api/translate';
  import {
    startEngine,
    waitForEngine,
    clearTorrents,
    addTorrent,
    getBestVideoFileIndex,
    getStreamUrl,
    getTorrentSubtitles
  } from '$lib/engine/torrent';
  import type { Movie } from '$lib/types';
  import VideoPlayer from '$lib/components/VideoPlayer.svelte';

  let movieId = $page.params.id as string;
  let movie = $state<Movie | null>(null);
  let loading = $state(true);
  let error = $state('');

  let isPlaying = $state(false);
  let videoSrc = $state('');
  let subtitles = $state<SubtitleTrack[]>([]);
  let engineStatus = $state('');
  let selectedTorrentHash = $state('');

  let translatedTitle = $state('');
  let translatedSynopsis = $state('');

  onMount(async () => {
    try {
      movie = await getMovieDetails(movieId);
      translatedTitle = movie.title;
      translatedSynopsis = movie.description_full || movie.summary || 'Nenhuma sinopse disponível.';

      if (typeof window !== 'undefined' && window.navigator) {
        const userLang = window.navigator.language || 'en';
        if (!userLang.startsWith('en')) {
          const targetLang = userLang.split('-')[0];
          translateText(movie.title, targetLang).then((res) => {
            if (res) translatedTitle = res;
          });
          if (movie.description_full || movie.summary) {
            translateText(movie.description_full || movie.summary, targetLang).then((res) => {
              if (res) translatedSynopsis = res;
            });
          }
        }
      }
    } catch (e: any) {
      error = e.message || 'Erro ao carregar filme';
    } finally {
      loading = false;
    }
  });

  $effect(() => {
    if (movie && movie.torrents && movie.torrents.length > 0 && !selectedTorrentHash) {
      let bestTorrent = movie.torrents.reduce((prev, current) => {
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
      movie.torrents.find((t) => t.hash === selectedTorrentHash) || movie.torrents[0];
    const magnet = `magnet:?xt=urn:btih:${selectedTorrent.hash}&dn=${encodeURIComponent(movie.title)}`;

    try {
      engineStatus = 'Iniciando player...';
      await startEngine();

      await waitForEngine();

      engineStatus = 'Preparando stream...';
      await clearTorrents();
      const details = await addTorrent(magnet);

      const bestFileIdx = getBestVideoFileIndex(details.files);
      const tSubs = getTorrentSubtitles(details.info_hash, details.files);

      engineStatus = 'Baixando legendas...';
      const eSubs = movieId ? await getExternalSubtitles(movieId) : [];

      engineStatus = 'Pronto para assistir.';
      videoSrc = getStreamUrl(details.info_hash, bestFileIdx);
      subtitles = [...tSubs, ...eSubs];
      isPlaying = true;
    } catch (e: any) {
      error = `Erro de reprodução: ${e.message}`;
      engineStatus = '';
    }
  }
</script>

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
{:else if movie}
  {#if movie.background_image_original || movie.background_image}
    <div class="pointer-events-none fixed inset-0">
      <img
        src={movie.background_image_original || movie.background_image}
        class="h-full w-full object-cover"
        alt=""
      />
      <div
        class="from-dark via-dark/80 absolute inset-0 bg-gradient-to-t to-transparent"
      ></div>
      <div
        class="from-dark/90 via-dark/40 absolute inset-0 bg-gradient-to-r to-transparent"
      ></div>
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
        <div class="mt-6 flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <label
              for="quality-select"
              class="text-primary text-sm font-bold tracking-widest uppercase">Qualidade</label
            >
            <div class="relative w-full">
              <select
                id="quality-select"
                bind:value={selectedTorrentHash}
                class="border-primary/50 focus:border-accent-green bg-surface text-main w-full appearance-none rounded border p-3 pr-10 font-mono text-sm focus:outline-none"
              >
                {#each movie.torrents as torrent}
                  <option value={torrent.hash} class="bg-surface text-main">
                    {torrent.quality} - {torrent.type} ({torrent.size})
                  </option>
                {/each}
              </select>
              <div
                class="text-primary pointer-events-none absolute inset-y-0 right-0 flex items-center px-3"
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
                  stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg
                >
              </div>
            </div>
          </div>

          <button
            onclick={playMovie}
            class="bg-primary hover:bg-accent-green hover:text-dark text-main flex w-full items-center justify-center gap-2 rounded border-2 border-transparent py-4 text-lg font-bold tracking-widest uppercase shadow-[0_0_15px_rgba(118,52,194,0.5)] transition-all duration-300 hover:border-white hover:shadow-[0_0_20px_rgba(91,255,59,0.8)]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg
            >
            Reproduzir
          </button>
        </div>
        {#if engineStatus}
          <div class="text-accent-orange mt-4 animate-pulse text-center font-mono text-sm">
            {engineStatus}
          </div>
        {/if}
      {/if}
    </div>

    <div class="w-full md:w-2/3">
      <h1
        class="text-main mb-2 text-4xl font-bold tracking-tight md:text-5xl"
        style="text-shadow: 0 0 10px rgba(255,255,255,0.2);"
      >
        {translatedTitle}
      </h1>

      <div class="text-primary mb-6 flex flex-wrap gap-4 font-mono text-sm">
        <span class="border-primary/50 bg-surface rounded border px-3 py-1">ANO: {movie.year}</span>
        {#if movie.director && movie.director.length > 0}
          <span class="border-primary/50 bg-surface rounded border px-3 py-1"
            >DIRETOR: {movie.director.join(', ')}</span
          >
        {/if}
        <span class="border-primary/50 bg-surface flex items-center gap-1 rounded border px-3 py-1">
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
          IMDB: {movie.rating}
        </span>
      </div>

      {#if isPlaying}
        <VideoPlayer src={videoSrc} {subtitles} />
      {:else}
        <div class="prose prose-invert text-muted mb-8 max-w-none leading-relaxed">
          <h3
            class="text-accent-green border-primary/30 mb-4 border-b pb-2 text-sm font-bold tracking-widest uppercase"
          >
            Sinopse
          </h3>
          <p>{translatedSynopsis}</p>
        </div>

        {#if movie.cast && movie.cast.length > 0}
          <div>
            <h3
              class="text-primary border-primary/30 mb-4 border-b pb-2 text-sm font-bold tracking-widest uppercase"
            >
              Elenco
            </h3>
            <div class="flex snap-x gap-4 overflow-x-auto pb-4">
              {#each movie.cast as actor}
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
  </div>
{/if}
