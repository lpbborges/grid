<script lang="ts">
  import { MAX_LIST_NAME_LENGTH } from '$lib/stores/lists.svelte';

  let {
    label,
    submitLabel,
    value = '',
    onsubmit,
    oncancel
  }: {
    label: string;
    submitLabel: string;
    value?: string;
    /** Returns why the name was refused, or null once it was accepted. */
    onsubmit: (name: string) => string | null;
    oncancel?: () => void;
  } = $props();

  let name = $state('');
  let error = $state('');
  let input = $state<HTMLInputElement>();

  $effect(() => {
    name = value;
    input?.focus();
    input?.select();
  });

  function submit() {
    error = onsubmit(name) ?? '';
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape' && oncancel) {
      e.stopPropagation();
      oncancel();
    }
  }
</script>

<div class="flex gap-2">
  <input
    bind:this={input}
    bind:value={name}
    type="text"
    aria-label={label}
    placeholder="Nome da lista"
    maxlength={MAX_LIST_NAME_LENGTH}
    oninput={() => (error = '')}
    {onkeydown}
    class="bg-dark border-primary/50 text-main placeholder-muted focus:border-green min-w-0 flex-1 rounded-xs border px-2 py-1.5 text-sm outline-none"
  />
  <button
    type="button"
    onclick={submit}
    class="border-green text-green hover:bg-green hover:text-dark focus-visible:ring-green cursor-pointer rounded-xs border px-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
  >
    {submitLabel}
  </button>
  {#if oncancel}
    <button
      type="button"
      onclick={oncancel}
      class="border-primary/50 text-main hover:border-green focus-visible:ring-green cursor-pointer rounded-xs border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      Cancelar
    </button>
  {/if}
</div>
{#if error}
  <p class="text-error mt-1.5 text-xs" role="alert">{error}</p>
{/if}
