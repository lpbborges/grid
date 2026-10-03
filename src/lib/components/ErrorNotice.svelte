<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import { ERROR_ACTION_LABELS, type ErrorAction, type PageError } from '$lib/utils/pageError';

  let { error, onaction }: { error: PageError; onaction: (action: ErrorAction) => void } = $props();
</script>

<div
  class="border-orange text-orange bg-surface/80 flex flex-col items-start gap-3 border-l-4 p-4 font-mono"
  role="alert"
>
  <span>{error.message}</span>
  <Button variant="warning" size="sm" onclick={() => onaction(error.action)}>
    {ERROR_ACTION_LABELS[error.action]}
  </Button>
</div>
