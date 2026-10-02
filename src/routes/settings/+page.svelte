<script lang="ts">
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import PreferenceSelectors from '$lib/components/PreferenceSelectors.svelte';
  import QualitySelector from '$lib/components/QualitySelector.svelte';
  import { DISCLAIMER_TEXT } from '$lib/components/DisclaimerModal.svelte';
  import { MAX_CACHE_LIMIT_BYTES, settingsStore } from '$lib/stores/settings.svelte';
  import { BYTES_PER_GB, formatGigabytes } from '$lib/utils/formatBytes';
  import { version } from '../../../package.json';

  let { data } = $props();

  let cacheUsageBytes = $derived(data.cacheUsageBytes);
  let cacheLimitGb = $derived(Math.round(settingsStore.cacheLimitBytes / BYTES_PER_GB));
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-10 pb-10">
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
