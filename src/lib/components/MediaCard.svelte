<script lang="ts">
  import type { Movie } from '../types';

  let { media, type = 'movie' } = $props<{ media: Movie; type?: 'movie' | 'series' }>();
</script>

<a
  href="/{type}/{media.id}"
  class="group bg-surface/50 relative flex w-[180px] shrink-0 cursor-pointer flex-col border border-transparent transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_0_20px_rgba(107,33,168,0.4)]"
  data-testid="media-card"
>
  <!-- Cyberpunk border effect -->
  <div
    class="border-primary/20 group-hover:border-primary/80 pointer-events-none absolute inset-0 border transition-colors duration-300"
  ></div>
  <div
    class="group-hover:border-accent-green pointer-events-none absolute -top-[1px] -left-[1px] z-10 h-2 w-2 border-t-2 border-l-2 border-transparent transition-colors duration-300"
  ></div>
  <div
    class="group-hover:border-accent-green pointer-events-none absolute -right-[1px] -bottom-[1px] z-10 h-2 w-2 border-r-2 border-b-2 border-transparent transition-colors duration-300"
  ></div>

  <div class="relative h-[270px] w-full overflow-hidden">
    <img
      src={media.medium_cover_image}
      alt={media.title}
      loading="lazy"
      class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 group-hover:opacity-80"
    />
    <!-- Scanline effect overlay on hover -->
    <div
      class="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
    ></div>
  </div>

  <div
    class="bg-surface/80 border-primary/20 group-hover:border-primary relative border-t p-3 transition-colors duration-300"
  >
    <div
      class="text-main font-cyber group-hover:text-accent-green w-full truncate text-center text-sm tracking-wider uppercase transition-colors duration-300"
    >
      {media.title}
    </div>
  </div>
</a>
