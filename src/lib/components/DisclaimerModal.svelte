<script lang="ts" module>
  export const DISCLAIMER_TEXT =
    'O Grid usa uma rede comunitária (peer-to-peer). Enquanto você assiste a um filme, seu computador o compartilha com outras pessoas. Recomendamos ligar uma VPN para proteger sua privacidade.';
</script>

<script lang="ts">
  import { settingsStore } from '$lib/stores/settings.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';

  function accept() {
    settingsStore.acceptedDisclaimer = true;
  }
</script>

<Modal
  open={!settingsStore.acceptedDisclaimer}
  role="alertdialog"
  dismissible={false}
  title="Bem-vindo ao Grid"
  description={DISCLAIMER_TEXT}
>
  {#snippet footer()}
    <Button variant="primary" size="lg" class="w-full" data-autofocus onclick={accept}>
      Entendi
    </Button>
  {/snippet}
</Modal>
