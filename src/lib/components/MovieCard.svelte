<script lang="ts">
  import type { Movie } from '../types';

  let { movie } = $props<{ movie: Movie }>();
</script>

<a
  href="/movie/{movie.id}"
  class="group relative overflow-hidden rounded border border-transparent bg-[#1a1a24] transition-all duration-300 hover:border-[var(--eva-accent-green)]"
  data-testid="movie-card"
>
  <div class="relative aspect-[2/3] w-full bg-[var(--eva-surface)]">
    <img
      src={movie.medium_cover_image}
      alt={movie.title}
      loading="lazy"
      class="h-full w-full object-cover"
    />
    <div
      class="absolute inset-0 flex flex-col items-center justify-center bg-black/60 p-4 text-center opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100"
    >
      <span class="mb-2 font-bold text-[var(--eva-accent-green)]">ACCESS</span>
      <span class="text-sm font-bold text-[var(--eva-primary)]">{movie.rating} / 10</span>
    </div>
  </div>
  <div class="p-3">
    <h2 class="truncate text-sm font-bold" title={movie.title}>{movie.title}</h2>
    <div class="mt-1 flex items-center justify-between">
      <span class="text-xs text-gray-400">{movie.year}</span>
      <span class="rounded bg-[var(--eva-primary)]/20 px-1 text-xs text-[var(--eva-primary)]"
        >HD</span
      >
    </div>
  </div>
</a>
