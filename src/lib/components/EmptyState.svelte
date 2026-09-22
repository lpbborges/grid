<script lang="ts">
  let { message } = $props<{ message: string }>();
</script>

<div
  class="border-primary/30 bg-surface/40 flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-sm border border-dashed p-6 text-center"
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="text-primary/60"
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M7 8l4 4-4 4" />
    <path d="M13 16h4" />
  </svg>
  <span class="text-muted font-cyber text-sm tracking-widest uppercase">{message}</span>
</div>
