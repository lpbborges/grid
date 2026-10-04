<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Label from '$lib/components/ui/Label.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import PreferenceSelectors from '$lib/components/PreferenceSelectors.svelte';
  import QualitySelector from '$lib/components/QualitySelector.svelte';
  import { DISCLAIMER_TEXT } from '$lib/components/DisclaimerModal.svelte';
  import {
    MAX_CACHE_LIMIT_BYTES,
    SUBTITLE_SCALE_STEPS,
    settingsStore
  } from '$lib/stores/settings.svelte';
  import { BYTES_PER_GB, formatGigabytes } from '$lib/utils/formatBytes';
  import { clearDownloadedVideos } from '$lib/engine/orchestrator';
  import { getCacheUsageBytes } from '$lib/engine/cache';
  import { logger } from '$lib/logger';
  import { version } from '../../../package.json';

  let { data } = $props();

  let subtitleScaleIndex = $derived(
    (SUBTITLE_SCALE_STEPS as readonly number[]).indexOf(settingsStore.subtitleScale)
  );

  let cacheUsageBytes = $derived(data.cacheUsageBytes);
  let cacheLimitGb = $derived(Math.round(settingsStore.cacheLimitBytes / BYTES_PER_GB));
  let confirmingClear = $state(false);
  let clearing = $state(false);
  let clearError = $state('');

  let canGoBack = false;
  afterNavigate(({ from }) => (canGoBack = from !== null));

  function goBack() {
    if (canGoBack) history.back();
    else void goto('/');
  }

  async function clearCache() {
    confirmingClear = false;
    clearing = true;
    clearError = '';
    try {
      await clearDownloadedVideos();
    } catch (error) {
      logger.error('Failed to clear the downloaded videos', error);
      clearError = 'Não foi possível apagar os vídeos.';
    }
    cacheUsageBytes = await getCacheUsageBytes().catch(() => null);
    clearing = false;
  }
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-10 pb-10">
  <div class="flex flex-col items-start gap-3">
    <Button variant="ghost" size="sm" class="-ml-3" onclick={goBack}>
      {#snippet leading()}
        <Icon name="chevron-left" size="md" />
      {/snippet}
      Voltar
    </Button>
    <h1 class="text-main text-xl font-bold">Configurações</h1>
  </div>

  <section>
    <SectionHeading heading="Reprodução" />
    <p class="text-muted mb-4 text-sm">Usado sempre que você começa a assistir algo.</p>
    <div class="flex flex-wrap gap-4">
      <PreferenceSelectors />
      <div class="flex-1">
        <QualitySelector />
      </div>
    </div>
    <div class="mt-4 flex flex-col gap-3">
      <div class="flex flex-col gap-2">
        <div class="flex items-baseline justify-between">
          <Label as="label" for="subtitle-scale">Tamanho da legenda</Label>
          <span class="text-main font-mono text-sm">{settingsStore.subtitleScale}%</span>
        </div>
        <input
          id="subtitle-scale"
          type="range"
          min="0"
          max={SUBTITLE_SCALE_STEPS.length - 1}
          step="1"
          value={subtitleScaleIndex}
          aria-valuetext={`${settingsStore.subtitleScale}%`}
          oninput={(e) =>
            (settingsStore.subtitleScale = SUBTITLE_SCALE_STEPS[Number(e.currentTarget.value)])}
          class="accent-green focus-visible:ring-green w-full cursor-pointer focus-visible:ring-2 focus-visible:outline-none"
        />
        <p class="text-muted text-sm">Também pode ser ajustado durante a reprodução.</p>
      </div>
      <div
        data-testid="subtitle-preview"
        aria-hidden="true"
        class="subtitle-preview border-line-strong w-full overflow-hidden rounded-sm border px-4 py-3 text-center"
        style:--subtitle-scale={settingsStore.subtitleScale / 100}
      >
        <p class="subtitle-preview-text">Eu disse que voltaria antes do amanhecer.</p>
      </div>
    </div>
  </section>

  <section>
    <SectionHeading heading="Armazenamento" />
    <p class="text-muted mb-4 text-sm">
      Os vídeos assistidos ficam guardados para começar mais rápido da próxima vez. Os mais antigos
      são apagados quando o limite é atingido.
    </p>
    <div class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between">
        <Label as="label" for="cache-limit">Limite de armazenamento</Label>
        <span class="text-main font-mono text-sm"
          >{formatGigabytes(settingsStore.cacheLimitBytes)}</span
        >
      </div>
      <input
        id="cache-limit"
        type="range"
        min="1"
        max={MAX_CACHE_LIMIT_BYTES / BYTES_PER_GB}
        step="1"
        value={cacheLimitGb}
        oninput={(e) =>
          (settingsStore.cacheLimitBytes = Number(e.currentTarget.value) * BYTES_PER_GB)}
        class="accent-green focus-visible:ring-green w-full cursor-pointer focus-visible:ring-2 focus-visible:outline-none"
      />
      <p class="text-muted font-mono text-xs">
        {cacheUsageBytes === null
          ? 'Uso indisponível'
          : `${formatGigabytes(cacheUsageBytes)} em uso`}
      </p>
    </div>
    <div class="mt-6 flex flex-wrap items-center gap-3">
      {#if confirmingClear}
        <span class="text-main text-sm">Apagar todos os vídeos guardados?</span>
        <Button variant="danger" onclick={clearCache}>Apagar</Button>
        <Button onclick={() => (confirmingClear = false)}>Cancelar</Button>
      {:else}
        <Button
          disabled={clearing || cacheUsageBytes === 0}
          onclick={() => (confirmingClear = true)}
        >
          {clearing
            ? 'Apagando...'
            : `Limpar vídeos baixados${cacheUsageBytes ? ` (${formatGigabytes(cacheUsageBytes)})` : ''}`}
        </Button>
      {/if}
      {#if clearError}
        <p class="text-error text-sm" role="alert">{clearError}</p>
      {/if}
    </div>
  </section>

  <section>
    <SectionHeading heading="Sobre" />
    <div class="text-muted flex flex-col gap-3 text-sm leading-relaxed">
      <p class="text-main font-mono">Versão {version}</p>
      <p>{DISCLAIMER_TEXT}</p>
      <p>
        No Linux e no Windows, o Grid inclui o libmpv, distribuído sob a licença LGPL 2.1 ou
        posterior. Os textos das licenças acompanham a instalação.
      </p>
    </div>
  </section>
</div>
