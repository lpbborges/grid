export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text) return text;
  try {
    // google translate free endpoint
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data[0]) {
      return data[0].map((item: any) => item[0]).join('');
    }
  } catch (e) {
    console.error('Translation error:', e);
  }
  return text;
}

export function getUserLanguage(): string {
  if (typeof window !== 'undefined' && window.navigator) {
    const userLang = window.navigator.language || 'en';
    if (!userLang.startsWith('en')) {
      return userLang.split('-')[0];
    }
  }
  return 'en';
}

export async function translateMediaInfo(title: string, synopsis: string) {
  const targetLang = getUserLanguage();
  if (targetLang === 'en') {
    return { title, synopsis: synopsis || 'Nenhuma sinopse disponível.' };
  }

  const [tTitle, tSynopsis] = await Promise.all([
    translateText(title, targetLang),
    synopsis ? translateText(synopsis, targetLang) : Promise.resolve('Nenhuma sinopse disponível.')
  ]);

  return {
    title: tTitle || title,
    synopsis: tSynopsis || synopsis || 'Nenhuma sinopse disponível.'
  };
}

export async function translateEpisodesList(episodes: any[]): Promise<Record<string, string>> {
  const targetLang = getUserLanguage();
  if (targetLang === 'en' || !episodes || episodes.length === 0) return {};

  const result: Record<string, string> = {};
  await Promise.all(
    episodes.map(async (ep) => {
      if (ep.name) {
        const translated = await translateText(ep.name, targetLang);
        if (translated) {
          result[ep.id] = translated;
        }
      }
    })
  );
  return result;
}
