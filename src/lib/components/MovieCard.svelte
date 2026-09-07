<script lang="ts">
  import type { Movie } from '../types';

  let { movie } = $props<{ movie: Movie }>();
</script>

<a
  href="/movie/{movie.id}"
  class="group hover:border-primary flex w-[180px] shrink-0 cursor-pointer flex-col border border-transparent bg-transparent transition-all duration-200 hover:scale-105 hover:shadow-[0_0_15px_rgba(118,52,194,0.5)]"
  data-testid="movie-card"
>
  <img
    src={movie.medium_cover_image}
    alt={movie.title}
    loading="lazy"
    class="h-[270px] w-full rounded-none object-cover"
  />
  <div class="text-text-main mt-2 w-full truncate text-center text-[0.95rem] font-medium">
    {movie.title}
  </div>
</a>
