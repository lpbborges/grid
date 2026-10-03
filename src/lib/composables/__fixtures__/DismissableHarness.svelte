<script lang="ts">
  import { useDismissable, type DismissReason } from '../useDismissable.svelte';

  let { onclose }: { onclose: (reason: DismissReason) => void } = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();

  useDismissable({
    open: () => open,
    root: () => root,
    onclose: (reason) => {
      open = false;
      onclose(reason);
    }
  });
</script>

<button type="button">outside</button>
<div bind:this={root}>
  <button type="button" onclick={() => (open = !open)}>trigger</button>
  {#if open}
    <div role="dialog" aria-label="panel">
      <button type="button">inside</button>
      <button type="button" onclick={(e) => e.currentTarget.remove()}>vanishing</button>
    </div>
  {/if}
</div>
