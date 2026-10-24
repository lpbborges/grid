import { translateMediaInfo } from '$lib/api/translate';

export interface TranslatableMedia {
  id: string | number;
  title: string;
  summary?: string;
  description_full?: string;
}

export function useTranslatedMedia(getMedia: () => TranslatableMedia | null | undefined) {
  let translatedTitle = $state('');
  let translatedSynopsis = $state('');

  $effect(() => {
    const media = getMedia();
    if (media) {
      const currentTitle = media.title;
      const currentSynopsis = media.description_full || media.summary || '';

      translatedTitle = currentTitle;
      translatedSynopsis = currentSynopsis || 'Nenhuma sinopse disponível.';

      translateMediaInfo(currentTitle, currentSynopsis, String(media.id)).then((res) => {
        const active = getMedia();
        if (active && active.title === currentTitle) {
          translatedTitle = res.title;
          translatedSynopsis = res.synopsis;
        }
      });
    } else {
      translatedTitle = '';
      translatedSynopsis = '';
    }
  });

  return {
    get title() {
      return translatedTitle;
    },
    get synopsis() {
      return translatedSynopsis;
    }
  };
}
