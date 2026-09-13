<script lang="ts">
  import { logger } from '$lib/logger';
  import { translateMediaInfo, translateEpisodesList } from '$lib/api/translate';
  import { getSeriesStreams } from '$lib/api/torrentio';
  import VideoPlayer from '$lib/components/VideoPlayer.svelte';
  import MediaInfo from '$lib/components/MediaInfo.svelte';
  import EpisodeList from '$lib/components/EpisodeList.svelte';
  import { useStreamPlayer } from '$lib/composables/useStreamPlayer.svelte';
  import { watchedStore } from '$lib/stores/watched.svelte';
  import { progressStore } from '$lib/stores/progress.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';

  let { data } = $props();
  let seriesId = $derived(data.seriesId);
  let series = $derived(data.series);
  let error = $state('');
  let errorSource = $state<'load' | 'play' | null>(null);
  let lastAttemptedEpisode = $state<any>(null);

  const streamPlayer = useStreamPlayer();

  let translatedTitle = $state('');
  let translatedSynopsis = $state('');

  let selectedSeason = $state<number | null>(null);
  let translatedEpisodes = $state<Record<string, string>>({});

  $effect(() => {
    if (data.error) {
      logger.error('Falha ao carregar série:', data.error);
      error = 'Não foi possível carregar este título. Tente novamente.';
      errorSource = 'load';
    } else if (seriesId) {
      error = '';
      errorSource = null;
    }
  });

  // Only stop an in-progress stream when seriesId actually changes (navigating
  // to a different series) — not on the initial mount, when there is nothing
  // to stop yet. Calling stop() unconditionally on mount let this effect race
  // with an immediate play() click (see the video-cache feature's Task 9).
  let hasMountedTorrentEffect = false;
  $effect(() => {
    if (seriesId) {
      selectedSeason = null;
      translatedEpisodes = {};
      if (hasMountedTorrentEffect) {
        streamPlayer.stop();
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

    lastAttemptedEpisode = episode;

    error = '';
    errorSource = null;

    try {
      const streams = await getSeriesStreams(seriesId, episode.season, episode.episode);

      if (!streams || streams.length === 0) {
        error = 'Nenhuma fonte encontrada para este episódio.';
        errorSource = 'play';
        return;
      }

      const getScore = (s: any) => {
        if (!s.infoHash) return -1;
        let score = 0;
        const text = (s.title || '').toLowerCase() + ' ' + (s.name || '').toLowerCase();

        if (text.includes(settingsStore.quality)) score += 100;
        score += 50;

        const wantPt = settingsStore.audio === 'pt';
        const isPt =
          text.includes('dublado') ||
          text.includes('dual audio') ||
          text.includes('multi-audio') ||
          text.includes('pt-br') ||
          text.includes('🇧🇷');

        if (wantPt && isPt) score += 500;
        if (!wantPt && !isPt) score += 100;

        return score;
      };

      let bestStream = streams.sort((a, b) => getScore(b) - getScore(a))[0];

      if (!bestStream || !bestStream.infoHash) {
        error = 'Fonte incompatível para este episódio.';
        errorSource = 'play';
        return;
      }

      const magnet = `magnet:?xt=urn:btih:${bestStream.infoHash}&dn=${encodeURIComponent(`${series.title} S${episode.season}E${episode.episode}`)}`;

      const ok = await streamPlayer.play(magnet, {
        mediaId: seriesId,
        season: episode.season,
        episode: episode.episode,
        fileIdx: bestStream.fileIdx
      });

      if (!ok) {
        error = streamPlayer.error;
        errorSource = 'play';
      }
    } catch (e: any) {
      logger.error('Erro ao buscar fontes do episódio:', e);
      error = 'Não foi possível iniciar a reprodução. Tente novamente.';
      errorSource = 'play';
    }
  }

  function retry() {
    if (errorSource === 'load') {
      window.location.reload();
    } else if (lastAttemptedEpisode) {
      playEpisode(lastAttemptedEpisode);
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
{:else if series}
  {#if series.background_image_original || series.background_image}
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
      {#if streamPlayer.isPlaying}
        <VideoPlayer
          src={streamPlayer.videoSrc}
          subtitles={streamPlayer.subtitles}
          mediaId={seriesId}
          season={lastAttemptedEpisode?.season}
          episode={lastAttemptedEpisode?.episode}
          originalLanguage={series?.language}
          initialTime={progressStore.get(
            seriesId,
            lastAttemptedEpisode?.season,
            lastAttemptedEpisode?.episode
          )?.time || 0}
          onclose={streamPlayer.stop}
          onwatched={() => {
            watchedStore.add(seriesId);
            if (lastAttemptedEpisode) {
              watchedStore.add(seriesId, lastAttemptedEpisode.season, lastAttemptedEpisode.episode);
            }
          }}
          engineStatus={streamPlayer.engineStatus}
          infoHash={streamPlayer.infoHash}
          totalBytes={streamPlayer.totalBytes}
        />
      {:else}
        <MediaInfo
          id={series.id}
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
      {#if !streamPlayer.isPlaying}
        <EpisodeList
          {seriesId}
          episodes={series.videos}
          {translatedEpisodes}
          bind:selectedSeason
          onPlayEpisode={playEpisode}
          originalLanguage={series?.language}
        />
      {/if}
    </div>
  </div>
{/if}
