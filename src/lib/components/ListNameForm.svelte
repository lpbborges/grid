<script lang="ts">
  import { tick } from 'svelte';
  import { MAX_LIST_NAME_LENGTH } from '$lib/stores/lists.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import TextField from '$lib/components/ui/TextField.svelte';

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

  const errorId = $props.id();
  let name = $state('');
  let error = $state('');
  let input = $state<HTMLInputElement>();

  $effect(() => {
    name = value;
    // The field shows the new name only after the DOM updates; select what it shows then.
    void tick().then(() => {
      input?.focus();
      input?.select();
    });
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
  <TextField
    bind:element={input}
    bind:value={name}
    size="sm"
    aria-label={label}
    placeholder="Nome da lista"
    maxlength={MAX_LIST_NAME_LENGTH}
    aria-invalid={error ? true : undefined}
    aria-describedby={error ? errorId : undefined}
    oninput={() => (error = '')}
    {onkeydown}
    class="flex-1"
  />
  <Button variant="accent" size="sm" onclick={submit}>{submitLabel}</Button>
  {#if oncancel}
    <Button size="sm" onclick={oncancel}>Cancelar</Button>
  {/if}
</div>
{#if error}
  <p id={errorId} class="text-error mt-1.5 text-xs" role="alert">{error}</p>
{/if}
