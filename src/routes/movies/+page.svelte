<script lang="ts">
  import GenreCatalogPage from '$lib/components/GenreCatalogPage.svelte';

  let { data } = $props();
</script>

<GenreCatalogPage type={data.type} genre={data.genre} rows={data.rows} />
