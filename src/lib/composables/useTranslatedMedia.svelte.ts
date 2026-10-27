import { translateMediaInfo } from '$lib/api/translate';

export interface TranslatableMedia {
  id: string | number;
  title: string;
  summary?: string;
  description_full?: string;
}

export function useTranslatedMedia(getMedia: () => TranslatableMedia | null | undefined) {
  const media = $derived(getMedia());
  let title = $derived(media?.title ?? '');
  let synopsis = $derived(
    media ? media.description_full || media.summary || 'Nenhuma sinopse disponível.' : ''
  );

  $effect(() => {
    const current = media;
    if (!current) return;

    let cancelled = false;
    const currentTitle = current.title;
    const currentSynopsis = current.description_full || current.summary || '';

    translateMediaInfo(currentTitle, currentSynopsis, String(current.id)).then((res) => {
      if (cancelled) return;
      title = res.title;
      synopsis = res.synopsis;
    });

    return () => {
      cancelled = true;
    };
  });

  return {
    get title() {
      return title;
    },
    get synopsis() {
      return synopsis;
    }
  };
}
