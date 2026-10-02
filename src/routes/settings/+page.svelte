<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import PreferenceSelectors from '$lib/components/PreferenceSelectors.svelte';
  import QualitySelector from '$lib/components/QualitySelector.svelte';
  import { DISCLAIMER_TEXT } from '$lib/components/DisclaimerModal.svelte';
  import { MAX_CACHE_LIMIT_BYTES, settingsStore } from '$lib/stores/settings.svelte';
  import { BYTES_PER_GB, formatGigabytes } from '$lib/utils/formatBytes';
  import { clearDownloadedVideos } from '$lib/engine/orchestrator';
  import { getCacheUsageBytes } from '$lib/engine/cache';
  import { logger } from '$lib/logger';
  import { version } from '../../../package.json';

  let { data } = $props();

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
  <div class="flex items-center gap-3">
    <button
      type="button"
      onclick={goBack}
      class="text-main hover:text-green focus-visible:ring-green flex h-10 cursor-pointer items-center gap-1.5 rounded-xs pr-3 text-base font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg
      >
      Voltar
    </button>
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
  </section>

  <section>
    <SectionHeading heading="Armazenamento" />
    <p class="text-muted mb-4 text-sm">
      Os vídeos assistidos ficam guardados para começar mais rápido da próxima vez. Os mais antigos
      são apagados quando o limite é atingido.
    </p>
    <div class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between">
        <label
          for="cache-limit"
          class="text-primary/70 text-[10px] font-bold tracking-widest uppercase"
          >Limite de armazenamento</label
        >
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
        <button
          type="button"
          onclick={clearCache}
          class="border-error text-error hover:bg-error/10 focus-visible:ring-error cursor-pointer rounded-sm border px-4 py-2 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          Apagar
        </button>
        <button
          type="button"
          onclick={() => (confirmingClear = false)}
          class="border-primary/50 text-main hover:border-green focus-visible:ring-green cursor-pointer rounded-sm border px-4 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          Cancelar
        </button>
      {:else}
        <button
          type="button"
          disabled={clearing || cacheUsageBytes === 0}
          onclick={() => (confirmingClear = true)}
          class="border-primary/50 text-main hover:border-green focus-visible:ring-green cursor-pointer rounded-sm border px-4 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {clearing
            ? 'Apagando...'
            : `Limpar vídeos baixados${cacheUsageBytes ? ` (${formatGigabytes(cacheUsageBytes)})` : ''}`}
        </button>
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
