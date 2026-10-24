<script lang="ts">
  import { useTranslatedMedia, type TranslatableMedia } from '../useTranslatedMedia.svelte';

  let { media }: { media: TranslatableMedia | null } = $props();
  const translated = useTranslatedMedia(() => media);
</script>

<div data-testid="title">{translated.title}</div>
<div data-testid="synopsis">{translated.synopsis}</div>
