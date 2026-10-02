<script lang="ts">
  import { ERROR_ACTION_LABELS, type ErrorAction, type PageError } from '$lib/utils/pageError';

  let { error, onaction }: { error: PageError; onaction: (action: ErrorAction) => void } = $props();
</script>

<div
  class="border-orange text-orange bg-surface/80 flex flex-col items-start gap-3 border-l-4 p-4 font-mono"
  role="alert"
>
  <span>{error.message}</span>
  <button
    onclick={() => onaction(error.action)}
    class="border-orange text-orange hover:bg-orange hover:text-dark focus-visible:ring-orange w-fit cursor-pointer rounded border px-4 py-2 text-xs font-bold tracking-widest uppercase transition-colors focus-visible:ring-2 focus-visible:outline-none"
  >
    {ERROR_ACTION_LABELS[error.action]}
  </button>
</div>
