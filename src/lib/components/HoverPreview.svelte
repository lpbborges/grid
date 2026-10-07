<script lang="ts">
  import { untrack } from 'svelte';
  import ListMenu from '$lib/components/ListMenu.svelte';
  import { getPreviewMeta, type PreviewMeta } from '$lib/api/cinemeta';
  import { logger } from '$lib/logger';
  import { hoverPreview } from '$lib/stores/hoverPreview.svelte';
  import { watchedStore } from '$lib/stores/watched.svelte';
  import { formatRuntime } from '$lib/utils/formatRuntime';
  import { genreName } from '$lib/utils/genres';

  const WIDTH = 400;
  const EDGE = 8;
  const BORDER = 2;
  const MAX_GENRES = 3;

  let active = $derived(hoverPreview.active);
  let panel = $state<HTMLElement>();
  let height = $state(0);
  let loadedImage = $state('');
  let launch = $state<{ clip: string; x: number; y: number; w: number; h: number } | null>(null);
  let loaded = $state<{ id: string | number; meta: PreviewMeta } | null>(null);

  let meta = $derived(loaded && loaded.id === active?.media.id ? loaded.meta : undefined);
  let href = $derived(active ? (active.href ?? `/${active.type}/${active.media.id}`) : '');
  let playHref = $derived(href + (href.includes('?') ? '&' : '?') + 'play=1');
  let poster = $derived(active?.media.medium_cover_image ?? '');
  // Wait for the details before choosing the image, so the backdrop never replaces the poster.
  let image = $derived(meta ? (meta.backdrop ?? poster) : '');
  let facts = $derived(
    active
      ? [
          active.type === 'movie' ? 'Filme' : 'Série',
          active.episodeLabel &&
            (active.upNext ? `Próximo: ${active.episodeLabel}` : active.episodeLabel),
          formatRuntime(meta?.runtime) ??
            (meta?.seasons
              ? `${meta.seasons} ${meta.seasons === 1 ? 'temporada' : 'temporadas'}`
              : undefined)
        ].filter((part): part is string => Boolean(part))
      : []
  );
  let progressPercent = $derived(
    active?.progress ? Math.min(100, (active.progress.time / active.progress.duration) * 100) : 0
  );
  let genres = $derived((meta?.genres ?? []).slice(0, MAX_GENRES).map(genreName));
  let position = $derived.by(() => {
    if (!active) return { left: 0, top: 0 };
    const rect = active.el.getBoundingClientRect();
    const left = rect.left + rect.width / 2 - WIDTH / 2;
    const top = rect.top + rect.height / 2 - height / 2;
    return {
      left: Math.max(EDGE, Math.min(left, window.innerWidth - WIDTH - EDGE)),
      top: Math.max(EDGE, Math.min(top, window.innerHeight - height - EDGE))
    };
  });

  $effect(() => {
    hoverPreview.panel = panel;
  });

  $effect(() => {
    void meta;
    if (panel) height = panel.offsetHeight;
  });

  // Shows the panel once measured, growing out of the poster it came from.
  $effect(() => {
    const el = panel;
    if (!el || el.dataset.ready || !active) return;
    const card = active.el;
    const from = (card.querySelector('img') ?? card).getBoundingClientRect();
    height = el.offsetHeight;
    const { left, top } = untrack(() => position);
    const x = from.left - left;
    const y = from.top - top;
    launch = {
      clip: `inset(${y}px ${WIDTH - x - from.width}px ${height - y - from.height}px ${x}px)`,
      x: x - BORDER,
      y: y - BORDER,
      w: from.width,
      h: from.height
    };
    el.dataset.ready = 'true';
  });

  $effect(() => {
    if (!active) return;
    const { type, media } = active;
    const controller = new AbortController();
    getPreviewMeta(type, media.id, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) loaded = { id: media.id, meta: result };
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        logger.warn('Failed to load the hover preview', error);
        loaded = { id: media.id, meta: {} };
      });
    return () => controller.abort();
  });

  /** Fades the panel out without letting it trap the pointer meanwhile. */
  function closing(node: HTMLElement) {
    node.inert = true;
    node.style.pointerEvents = 'none';
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    return {
      duration: reduced ? 0 : 180,
      css: (t: number) => `opacity: ${t}; transform: scale(${0.96 + 0.04 * t})`
    };
  }

  function removeFromRow() {
    const remove = active?.onremove;
    hoverPreview.close();
    remove?.();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !active) return;
    const card = active.el;
    const hadFocus = panel?.contains(document.activeElement) ?? false;
    hoverPreview.close();
    if (hadFocus) card.focus();
  }

  function onFocusout(e: FocusEvent) {
    if (!active) return;
    const next = e.relatedTarget;
    if (next instanceof Node && panel?.contains(next)) return;
    hoverPreview.leave(active.el);
  }
</script>

<svelte:window onkeydown={onKeydown} onresize={() => hoverPreview.close()} />

{#if active}
  {@const { type, media } = active}
  <div
    bind:this={panel}
    role="group"
    aria-label="Detalhes de {media.title}"
    data-testid="hover-preview"
    onmouseenter={() => hoverPreview.keep()}
    onmouseleave={() => hoverPreview.leave(active.el)}
    onfocusin={() => hoverPreview.keep()}
    onfocusout={onFocusout}
    out:closing
    class="hover-preview bg-surface border-primary/80 fixed z-40 flex flex-col border-2 {watchedStore.has(
      media.id
    )
      ? 'shadow-hud-green'
      : 'shadow-hud-primary'}"
    style="left: {position.left}px; top: {position.top}px; width: {WIDTH}px"
    style:--clip={launch?.clip}
    style:--poster-x={launch && `${launch.x}px`}
    style:--poster-y={launch && `${launch.y}px`}
    style:--poster-w={launch && `${launch.w}px`}
    style:--poster-h={launch && `${launch.h}px`}
  >
    <div
      class="border-green pointer-events-none absolute -top-0.5 -left-0.5 z-30 h-3 w-3 border-t-2 border-l-2"
    ></div>
    <div
      class="border-green pointer-events-none absolute -right-0.5 -bottom-0.5 z-30 h-3 w-3 border-r-2 border-b-2"
    ></div>
    <img
      src={poster}
      alt=""
      aria-hidden="true"
      data-testid="hover-preview-poster"
      class="hover-preview-poster pointer-events-none absolute z-20 object-cover"
    />
    <div class="bg-dark relative aspect-video w-full overflow-hidden">
      <a {href} onclick={() => hoverPreview.close()} tabindex="-1" aria-hidden="true">
        {#if image}
          <img
            src={image}
            alt=""
            data-testid="hover-preview-image"
            onload={() => (loadedImage = image)}
            class="absolute inset-0 h-full w-full object-cover transition-opacity duration-200 {loadedImage ===
            image
              ? 'opacity-100'
              : 'opacity-0'}"
          />
        {/if}
      </a>
      {#if active.progress}
        <div class="bg-main/20 pointer-events-none absolute bottom-0 left-0 h-1 w-full">
          <div
            class="bg-secondary shadow-glow-orange h-full"
            data-testid="hover-preview-progress"
            style="width: {progressPercent}%"
          ></div>
        </div>
      {/if}
    </div>
    <div class="hover-preview-body flex flex-col gap-2.5 p-4">
      <div class="flex items-center gap-2">
        <a
          href={playHref}
          onclick={() => hoverPreview.close()}
          aria-label="Assistir {media.title}"
          title="Assistir"
          data-testid="hover-preview-play"
          class="bg-primary border-primary text-main focus-visible:ring-green flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border-2 transition-transform duration-200 hover:scale-105 focus-visible:ring-2 focus-visible:outline-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg
          >
        </a>
        <ListMenu compact id={media.id} meta={{ type, title: media.title, poster }} />
        <button
          type="button"
          onclick={() => watchedStore.toggle(media.id)}
          aria-pressed={watchedStore.has(media.id)}
          aria-label={watchedStore.has(media.id)
            ? 'Marcado como assistido'
            : 'Marcar como assistido'}
          title={watchedStore.has(media.id) ? 'Marcado como assistido' : 'Marcar como assistido'}
          data-testid="hover-preview-watched"
          class="focus-visible:ring-green flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border-2 transition-all duration-300 hover:scale-105 focus-visible:ring-2 focus-visible:outline-none {watchedStore.has(
            media.id
          )
            ? 'bg-green/15 border-green text-green shadow-glow-green'
            : 'border-primary/50 text-muted bg-surface/60 hover:border-green hover:text-green'}"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg
          >
        </button>
        <div class="ml-auto flex items-center gap-2">
          {#if active.onremove}
            <button
              type="button"
              aria-label="Remover de Continuar assistindo"
              title="Remover de Continuar assistindo"
              data-testid="hover-preview-remove"
              onclick={removeFromRow}
              class="border-primary/50 text-muted bg-surface/60 hover:border-error hover:text-error focus-visible:ring-green flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border-2 transition-all duration-300 hover:scale-105 focus-visible:ring-2 focus-visible:outline-none"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg
              >
            </button>
          {/if}
          <a
            {href}
            onclick={() => hoverPreview.close()}
            aria-label="Mais detalhes de {media.title}"
            title="Mais detalhes"
            data-testid="hover-preview-details"
            class="border-primary/50 text-muted bg-surface/60 hover:border-green hover:text-green focus-visible:ring-green flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border-2 transition-all duration-300 hover:scale-105 focus-visible:ring-2 focus-visible:outline-none"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg
            >
          </a>
        </div>
      </div>
      <div
        class="text-main font-cyber truncate text-base tracking-wider uppercase"
        data-testid="hover-preview-title"
      >
        {media.title}
      </div>
      <p class="text-muted font-mono text-xs tracking-wider" data-testid="hover-preview-facts">
        {facts.join(' · ')}
      </p>
      {#if active.progress}
        <span class="sr-only">{Math.round(progressPercent)}% assistido</span>
      {/if}
      {#if genres.length > 0}
        <!-- A taller line box with matching negative margins keeps the 16px row, but leaves
             room for Orbitron's descent, which WebKitGTK otherwise clips at the bottom. -->
        <p
          class="text-green font-cyber -my-1 truncate text-xs leading-6 tracking-widest uppercase"
          data-testid="hover-preview-genres"
        >
          {genres.join(' · ')}
        </p>
      {:else}
        <div class="h-4" aria-hidden="true"></div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .hover-preview:not([data-ready]) {
    visibility: hidden;
  }

  .hover-preview-poster {
    left: var(--poster-x);
    top: var(--poster-y);
    width: var(--poster-w);
    height: var(--poster-h);
    opacity: 0;
  }

  @media (prefers-reduced-motion: no-preference) {
    .hover-preview:global([data-ready]) {
      animation: hover-preview-in 340ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .hover-preview:global([data-ready]) .hover-preview-poster {
      animation: hover-preview-poster-out 180ms ease-in-out 40ms both;
    }

    .hover-preview:global([data-ready]) .hover-preview-body {
      animation: hover-preview-fade 180ms ease-out 140ms backwards;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hover-preview:global([data-ready]) {
      animation: hover-preview-fade 100ms ease-out;
    }

    .hover-preview-poster {
      display: none;
    }
  }

  @keyframes hover-preview-in {
    from {
      clip-path: var(--clip);
    }
    to {
      clip-path: inset(0);
    }
  }

  @keyframes hover-preview-poster-out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }

  @keyframes hover-preview-fade {
    from {
      opacity: 0;
    }
  }
</style>
