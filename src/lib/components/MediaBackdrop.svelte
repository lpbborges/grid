<script lang="ts">
  interface Props {
    src?: string | null;
    opacityClass?: string;
  }

  let { src, opacityClass = '' }: Props = $props();
</script>

{#if src}
  <div class="pointer-events-none fixed inset-0">
    <img
      {src}
      class={['h-full w-full object-cover', opacityClass].filter(Boolean).join(' ')}
      alt=""
    />
    <div class="from-dark via-dark/80 absolute inset-0 bg-gradient-to-t to-transparent"></div>
    <div class="from-dark via-dark/80 absolute inset-0 bg-gradient-to-r to-transparent"></div>
  </div>
{/if}
