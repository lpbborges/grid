<script lang="ts">
  let { src } = $props<{ src: string }>();
</script>

<div
  class="relative mb-6 aspect-video w-full overflow-hidden rounded border-2 border-[var(--eva-accent-green)] bg-black shadow-[0_0_30px_rgba(91,255,59,0.2)]"
  data-testid="video-player-container"
>
  <!-- svelte-ignore a11y_media_has_caption -->
  <video {src} controls autoplay class="h-full w-full" data-testid="video-element"></video>
</div>
