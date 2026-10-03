<script lang="ts">
  import Modal from '../Modal.svelte';
  import Button from '../Button.svelte';

  let {
    dismissible = true,
    role = 'dialog',
    onclose
  }: { dismissible?: boolean; role?: 'dialog' | 'alertdialog'; onclose?: () => void } = $props();

  let open = $state(false);
</script>

<div data-testid="app">
  <button type="button" onclick={() => (open = true)}>Abrir</button>
</div>
<div data-titlebar data-testid="titlebar"><button type="button">Fechar janela</button></div>

<Modal
  {open}
  {dismissible}
  {role}
  title="Aviso"
  description="Leia com atenção."
  onclose={() => {
    open = false;
    onclose?.();
  }}
>
  {#snippet footer()}
    <Button variant="primary" data-autofocus onclick={() => (open = false)}>Entendi</Button>
    <Button>Outro</Button>
  {/snippet}
</Modal>
