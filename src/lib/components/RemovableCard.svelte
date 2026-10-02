<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    id,
    label,
    onremove,
    children
  }: { id: string | number; label: string; onremove: () => void; children: Snippet } = $props();
</script>

<div class="group/cw relative shrink-0 [&:has(>button:hover)>a]:-translate-y-2" data-id={id}>
  {@render children()}
  <button
    type="button"
    aria-label={label}
    title={label}
    onclick={onremove}
    class="border-primary/60 bg-dark/85 text-main hover:border-error hover:text-error focus-visible:ring-green focus-visible:ring-offset-dark absolute top-2 left-2 z-50 flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border opacity-0 backdrop-blur-sm transition-all duration-300 group-focus-within/cw:opacity-100 group-hover/cw:-translate-y-2 group-hover/cw:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
      aria-hidden="true"
    >
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  </button>
</div>
