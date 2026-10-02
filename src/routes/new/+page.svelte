<script lang="ts">
  import CatalogPage from '$lib/components/CatalogPage.svelte';

  let { data } = $props();
</script>

<CatalogPage title="Novidades e Populares" rows={data.rows} />
