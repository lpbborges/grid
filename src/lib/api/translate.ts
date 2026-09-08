export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text) return text;

  try {
    // google translate free endpoint
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data && data[0]) {
        return data[0].map((item: any) => item[0]).join('');
      }
    }
  } catch (e) {
    console.warn('Google Translation error, trying Lingva fallback:', e);
  }

  // Fallback 1: Lingva API (Google Translate proxy)
  try {
    const lingvaUrl = `https://lingva.ml/api/v1/auto/${targetLang}/${encodeURIComponent(text)}`;
    const lingvaRes = await fetch(lingvaUrl);
    if (lingvaRes.ok) {
      const lingvaData = await lingvaRes.json();
      if (lingvaData && lingvaData.translation) {
        return lingvaData.translation;
      }
    }
  } catch (e) {
    console.warn('Lingva fallback error, trying MyMemory fallback:', e);
  }

  // Fallback 2: MyMemory API
  try {
    const myMemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`;
    const myMemoryRes = await fetch(myMemoryUrl);
    if (myMemoryRes.ok) {
      const myMemoryData = await myMemoryRes.json();
      // MyMemory returns 200 status in JSON for success
      if (
        myMemoryData &&
        myMemoryData.responseStatus === 200 &&
        myMemoryData.responseData &&
        myMemoryData.responseData.translatedText
      ) {
        return myMemoryData.responseData.translatedText;
      }
    }
  } catch (e) {
    console.error('All translation APIs failed:', e);
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
