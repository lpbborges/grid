<script lang="ts" module>
  export const DISCLAIMER_TEXT =
    'O Grid usa uma rede comunitária (peer-to-peer). Enquanto você assiste a um filme, seu computador o compartilha com outras pessoas. Recomendamos ligar uma VPN para proteger sua privacidade.';
</script>

<script lang="ts">
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { fade } from 'svelte/transition';

  function accept() {
    settingsStore.acceptedDisclaimer = true;
  }
</script>

{#if !settingsStore.acceptedDisclaimer}
  <div
    out:fade={{ duration: 300 }}
    class="bg-dark/90 fixed inset-0 z-[90] flex items-center justify-center p-4 backdrop-blur-sm"
  >
    <div
      class="bg-surface border-primary/20 flex max-w-lg flex-col gap-6 rounded-xl border p-8 shadow-2xl"
    >
      <h2 class="text-main text-center text-2xl font-bold">Bem-vindo ao Grid</h2>
      <p class="text-muted text-center text-base leading-relaxed">{DISCLAIMER_TEXT}</p>
      <button
        class="bg-primary hover:bg-primary/80 text-main w-full cursor-pointer rounded-lg px-6 py-3 font-bold transition-colors"
        onclick={accept}
      >
        Entendi
      </button>
    </div>
  </div>
{/if}
