<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getMovieDetails } from '$lib/api/yts';
  import {
    startEngine,
    addTorrent,
    getBestVideoFileIndex,
    getStreamUrl
  } from '$lib/engine/torrent';
  import type { Movie } from '$lib/types';
  import VideoPlayer from '$lib/components/VideoPlayer.svelte';

  let movieId = $page.params.id as string;
  let movie = $state<Movie | null>(null);
  let loading = $state(true);
  let error = $state('');

  let isPlaying = $state(false);
  let videoSrc = $state('');
  let engineStatus = $state('');

  onMount(async () => {
    try {
      movie = await getMovieDetails(movieId);
    } catch (e: any) {
      error = e.message || 'Error fetching movie';
    } finally {
      loading = false;
    }
  });

  async function playMovie() {
    if (!movie || !movie.torrents || movie.torrents.length === 0) {
      error = 'No torrents available';
      return;
    }

    let bestTorrent = movie.torrents.reduce((prev, current) => {
      if (current.quality === '1080p' && prev.quality !== '1080p') return current;
      if (prev.quality === '1080p' && current.quality !== '1080p') return prev;
      return prev.seeds > current.seeds ? prev : current;
    });

    const magnet = `magnet:?xt=urn:btih:${bestTorrent.hash}&dn=${encodeURIComponent(movie.title)}`;

    try {
      engineStatus = 'Starting torrent engine...';
      await startEngine();

      await new Promise((r) => setTimeout(r, 1000));

      engineStatus = 'Acquiring torrent metadata...';
      const details = await addTorrent(magnet);

      const bestFileIdx = getBestVideoFileIndex(details.files);

      engineStatus = 'Streaming initialized.';
      videoSrc = getStreamUrl(details.info_hash, bestFileIdx);
      isPlaying = true;
    } catch (e: any) {
      error = `Playback error: ${e.message}`;
      engineStatus = '';
    }
  }
</script>

<div class="mb-4">
  <a
    href="/"
    class="flex items-center gap-2 text-sm font-bold tracking-wider text-[var(--eva-primary)] uppercase transition-colors hover:text-[var(--eva-accent-green)]"
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
      stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg
    >
    Back to Catalog
  </a>
</div>

{#if loading}
  <div class="flex justify-center py-20">
    <div
      class="animate-pulse font-mono text-xl tracking-widest text-[var(--eva-accent-green)] uppercase"
    >
      Retrieving Data...
    </div>
  </div>
{:else if error}
  <div
    class="border-l-4 border-[var(--eva-accent-orange)] bg-[var(--eva-surface)] p-4 font-mono text-[var(--eva-accent-orange)]"
  >
    Error: {error}
  </div>
{:else if movie}
  <div class="flex flex-col gap-8 md:flex-row">
    <div class="w-full max-w-sm md:w-1/3">
      <div class="rounded border border-[var(--eva-primary)]/30 bg-[var(--eva-surface)] p-2">
        <img
          src={movie.large_cover_image}
          alt={movie.title}
          class="h-auto w-full rounded object-cover shadow-lg"
        />
      </div>

      {#if !isPlaying}
        <button
          onclick={playMovie}
          class="mt-6 flex w-full items-center justify-center gap-2 rounded border-2 border-transparent bg-[var(--eva-primary)] py-4 text-lg font-bold tracking-widest text-white uppercase shadow-[0_0_15px_rgba(118,52,194,0.5)] transition-all duration-300 hover:border-white hover:bg-[var(--eva-accent-green)] hover:text-[var(--eva-bg-dark)] hover:shadow-[0_0_20px_rgba(91,255,59,0.8)]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg
          >
          Initialize Playback
        </button>
        {#if engineStatus}
          <div
            class="mt-4 animate-pulse text-center font-mono text-sm text-[var(--eva-accent-orange)]"
          >
            {engineStatus}
          </div>
        {/if}
      {/if}
    </div>

    <div class="w-full md:w-2/3">
      <h1
        class="mb-2 text-4xl font-bold tracking-tight text-[var(--eva-text-main)] md:text-5xl"
        style="text-shadow: 0 0 10px rgba(255,255,255,0.2);"
      >
        {movie.title}
      </h1>

      <div class="mb-6 flex flex-wrap gap-4 font-mono text-sm text-[var(--eva-primary)]">
        <span class="rounded border border-[var(--eva-primary)]/50 bg-[#1a1a24] px-3 py-1"
          >YEAR: {movie.year}</span
        >
        <span
          class="flex items-center gap-1 rounded border border-[var(--eva-primary)]/50 bg-[#1a1a24] px-3 py-1"
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
          IMDB: {movie.rating}
        </span>
      </div>

      {#if isPlaying}
        <VideoPlayer src={videoSrc} />
      {:else}
        <div class="prose prose-invert mb-8 max-w-none leading-relaxed text-gray-300">
          <h3
            class="mb-4 border-b border-[var(--eva-surface)] pb-2 text-sm font-bold tracking-widest text-[var(--eva-accent-green)] uppercase"
          >
            Synopsis
          </h3>
          <p>{movie.description_full || movie.summary || 'No synopsis available.'}</p>
        </div>

        <div>
          <h3
            class="mb-4 border-b border-[var(--eva-surface)] pb-2 text-sm font-bold tracking-widest text-[var(--eva-primary)] uppercase"
          >
            Available Streams
          </h3>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {#each movie.torrents as torrent}
              <div
                class="flex flex-col justify-between rounded border border-[var(--eva-surface)] bg-[#1a1a24] p-3 transition-colors hover:border-[var(--eva-primary)]"
              >
                <div class="mb-2 flex items-center justify-between">
                  <span class="font-bold text-white">{torrent.quality}</span>
                  <span class="text-xs text-gray-400">{torrent.type}</span>
                </div>
                <div class="flex justify-between font-mono text-xs">
                  <span class="text-[var(--eva-accent-green)]">S: {torrent.seeds}</span>
                  <span class="text-[var(--eva-primary)]">{torrent.size}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
