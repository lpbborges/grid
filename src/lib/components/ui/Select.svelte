<script lang="ts" module>
  export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
  }
</script>

<script lang="ts">
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';

  const BASE =
    'w-full appearance-none rounded-sm border bg-surface pr-8 pl-3 text-main transition-colors focus-visible:border-green focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-dark focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';

  const SIZES = {
    sm: 'h-8 text-sm',
    md: 'h-10 text-sm'
  } as const;

  let {
    label,
    options,
    value = $bindable(),
    size = 'md',
    mono = false,
    showLabel = true,
    error,
    disabled = false,
    id,
    class: className = '',
    onchange
  }: {
    /** The field's name (pt-BR). Always required: with `showLabel={false}` it becomes the aria-label. */
    label: string;
    options: SelectOption[];
    value?: string;
    size?: keyof typeof SIZES;
    /** Monospace, for values that read as data (quality: 1080p). */
    mono?: boolean;
    showLabel?: boolean;
    error?: string;
    disabled?: boolean;
    id?: string;
    /** Layout of the wrapper (width, flex, margin). */
    class?: string;
    onchange?: (value: string) => void;
  } = $props();

  const uid = $props.id();
  const selectId = $derived(id ?? `select-${uid}`);
  const errorId = $derived(`${selectId}-error`);

  function handleChange(e: Event & { currentTarget: HTMLSelectElement }) {
    value = e.currentTarget.value;
    onchange?.(value);
  }
</script>

<div class="flex w-full flex-col gap-1 {className}">
  {#if showLabel}
    <Label as="label" for={selectId}>{label}</Label>
  {/if}
  <div class="relative">
    <select
      id={selectId}
      {value}
      {disabled}
      aria-label={showLabel ? undefined : label}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      onchange={handleChange}
      class="{BASE} {SIZES[size]} {mono ? 'font-mono' : ''} {error
        ? 'border-error'
        : 'border-line-strong hover:border-line-focus'}"
    >
      {#each options as option (option.value)}
        <option value={option.value} disabled={option.disabled} class="bg-surface text-main">
          {option.label}
        </option>
      {/each}
    </select>
    <Icon
      name="chevron-down"
      size="xs"
      class="text-primary pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
    />
  </div>
  {#if error}
    <p id={errorId} role="alert" class="text-error text-xs">{error}</p>
  {/if}
</div>
