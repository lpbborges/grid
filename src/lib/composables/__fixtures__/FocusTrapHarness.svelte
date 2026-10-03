<script lang="ts">
  import { useFocusTrap } from '../useFocusTrap.svelte';

  let { withAutofocus = false }: { withAutofocus?: boolean } = $props();

  let active = $state(false);
  let root = $state<HTMLElement>();

  useFocusTrap({ active: () => active, root: () => root });
</script>

<button type="button" onclick={() => (active = true)}>open</button>
<button type="button" onclick={() => (active = false)}>release</button>
<div bind:this={root}>
  <button type="button">first</button>
  <button type="button" data-autofocus={withAutofocus ? '' : undefined}>second</button>
  <button type="button">last</button>
</div>
