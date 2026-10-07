<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  import Label from './Label.svelte';

  const FIELD =
    'flex w-full items-center gap-2 rounded-sm border px-3 text-main transition-colors has-[:focus-visible]:border-green has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-green has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50';

  const SIZES = {
    sm: 'h-8 text-sm',
    md: 'h-10 text-sm',
    lg: 'h-10 text-base font-medium'
  } as const;

  // The field is always the opposite layer of what it sits on.
  const SURFACES = {
    panel: 'bg-dark',
    page: 'bg-surface/90'
  } as const;

  let {
    label,
    hint,
    error,
    value = $bindable(''),
    size = 'md',
    surface = 'panel',
    glow = false,
    leading,
    trailing,
    element = $bindable(),
    id,
    class: className = '',
    ...rest
  }: Omit<HTMLInputAttributes, 'class' | 'size' | 'value'> & {
    /** Visible name. Without it, pass `aria-label`. */
    label?: string;
    hint?: string;
    error?: string;
    value?: string;
    size?: keyof typeof SIZES;
    /** `page` for a field on the page canvas, `panel` (default) for one inside a surface. */
    surface?: keyof typeof SURFACES;
    /** The idle green neon edge; the search field only. */
    glow?: boolean;
    leading?: Snippet;
    trailing?: Snippet;
    element?: HTMLInputElement;
    /** Layout of the whole field (width, flex, margin). */
    class?: string;
  } = $props();

  const uid = $props.id();
  const inputId = $derived(id ?? `field-${uid}`);
  const hintId = $derived(`${inputId}-hint`);
  const errorId = $derived(`${inputId}-error`);
  const describedBy = $derived(
    [error ? errorId : undefined, hint ? hintId : undefined].filter(Boolean).join(' ') || undefined
  );
</script>

<div class="flex min-w-0 flex-col gap-1 {className}">
  {#if label}
    <Label as="label" for={inputId}>{label}</Label>
  {/if}
  <div
    class="{FIELD} {SIZES[size]} {SURFACES[surface]} {glow ? 'shadow-glow-green' : ''} {error
      ? 'border-error'
      : 'border-line-strong hover:border-line-focus'}"
  >
    {@render leading?.()}
    <input
      bind:this={element}
      bind:value
      id={inputId}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      class="placeholder:text-muted min-w-0 flex-1 bg-transparent outline-none [&::-webkit-search-cancel-button]:hidden"
      {...rest}
    />
    {@render trailing?.()}
  </div>
  {#if error}
    <p id={errorId} role="alert" class="text-error text-xs">{error}</p>
  {/if}
  {#if hint}
    <p id={hintId} class="text-muted text-xs">{hint}</p>
  {/if}
</div>
