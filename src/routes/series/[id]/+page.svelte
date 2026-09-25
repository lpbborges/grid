<script lang="ts">
  import { untrack } from 'svelte';
  import { logger } from '$lib/logger';
  import { translateMediaInfo, translateEpisodesList } from '$lib/api/translate';
  import { buildMagnet, getSeriesStreams, parseSeedCount } from '$lib/api/torrentio';
  import Player from '$lib/components/Player.svelte';
  import MediaInfo from '$lib/components/MediaInfo.svelte';
  import EpisodeList from '$lib/components/EpisodeList.svelte';
  import { usePlayer } from '$lib/composables/usePlayer.svelte';

  import { settingsStore } from '$lib/stores/settings.svelte';
  import { watchedStore } from '$lib/stores/watched.svelte';
  import { rankStreamOptions } from '$lib/engine/ranking';
  import type { Episode } from '$lib/types';

  let { data } = $props();
  let seriesId = $derived(data.seriesId);
  let series = $derived(data.series);
  let error = $state('');
  let errorSource = $state<'load' | 'play' | null>(null);
  let lastAttemptedEpisode = $state<Episode | null>(null);

  const player = usePlayer(() => videoElement, {
    onwatched: () => {
      if (lastAttemptedEpisode) {
        watchedStore.add(seriesId, lastAttemptedEpisode.season, lastAttemptedEpisode.episode);
      }
    }
  });
  const backend = player.backend;
  // Windows plays through mpv embedded in this window; else mounts <video>.
  let videoElement = $state<HTMLVideoElement | null>(null);

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

  async function playEpisode(episode: Episode) {
    if (typeof window === 'undefined' || !series) return;

    lastAttemptedEpisode = episode;
    const requestedId = seriesId;

    error = '';
    errorSource = null;

    try {
      const streams = await getSeriesStreams(seriesId, episode.season, episode.episode);
      // The route moved to another series while the sources were loading.
      if (seriesId !== requestedId) return;

      if (!streams || streams.length === 0) {
        error = 'Nenhuma fonte encontrada para este episódio.';
        errorSource = 'play';
        return;
      }

      const rankableStreams = streams.filter((s) => s.infoHash);

      const sorted = rankStreamOptions(
        rankableStreams,
        (s) => {
          const text = ((s.title || '') + ' ' + (s.name || '')).toLowerCase();
          const qualityMatch = s.name?.match(/(4k|1080p|720p|480p)/i);
          const quality = qualityMatch ? qualityMatch[1].toLowerCase() : 'unknown';
          return { quality, text, seeds: parseSeedCount(s.title) };
        },
        { quality: settingsStore.quality, audioPreference: settingsStore.audio }
      );

      const bestStream = sorted[0];

      if (!bestStream || !bestStream.infoHash) {
        error = 'Fonte incompatível para este episódio.';
        errorSource = 'play';
        return;
      }

      const magnet = buildMagnet(
        bestStream.infoHash,
        `${series.title} S${episode.season}E${episode.episode}`,
        bestStream.sources
      );

      const ok = await player.play(magnet, {
        mediaId: seriesId,
        season: episode.season,
        episode: episode.episode,
        fileIdx: bestStream.fileIdx,
        originalLanguage: series?.language
      });

      // The route moved to another series while the stream was being prepared.
      if (seriesId !== requestedId) return;
      if (!ok && player.error) {
        error = player.error;
        errorSource = 'play';
      }
    } catch (e) {
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

{#if !player.isPlaying}
  <div class="relative z-20 mb-8">
    <a
      href="/"
      class="border-primary/50 bg-surface/50 hover:border-green hover:text-green text-main group hover:shadow-green/20 flex w-fit items-center gap-2 rounded-sm border px-4 py-2 text-sm font-bold tracking-wider uppercase shadow-sm backdrop-blur-sm transition-all hover:shadow-md"
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
      Voltar
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
      {#if player.isPlaying}
        <Player
          {backend}
          bind:videoElement
          engineStatus={player.engineStatus}
          downloadPercent={player.downloadPercent}
          onclose={() => {
            player.stop();
          }}
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
      {#if !player.isPlaying}
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
