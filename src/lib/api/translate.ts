import { logger } from '$lib/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { getCached, setCached } from '../stores/translation-cache';

const TRANSLATE_TIMEOUT_MS = 6000;

// Module-level dedup map: concurrent requests for the same (text, targetLang)
// share a single in-flight promise instead of firing redundant fetch cascades.
const inFlightRequests = new Map<string, Promise<string>>();

export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text) return text;

  const key = `${text}|${targetLang}`;

  const cached = await getCached(text, targetLang);
  if (cached !== undefined) return cached;

  const existing = inFlightRequests.get(key);
  if (existing) return existing;

  const requestPromise = performTranslation(text, targetLang).finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, requestPromise);
  return requestPromise;
}

async function performTranslation(text: string, targetLang: string): Promise<string> {
  const translated = await runTranslationCascade(text, targetLang);
  if (translated !== text) {
    await setCached(text, targetLang, translated);
  }
  return translated;
}

async function runTranslationCascade(text: string, targetLang: string): Promise<string> {
  try {
    // google translate free endpoint
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetchWithTimeout(url, {}, TRANSLATE_TIMEOUT_MS);
    if (res.ok) {
      const data = await res.json();
      if (data && data[0]) {
        return data[0].map((item: any) => item[0]).join('');
      }
    }
  } catch (e) {
    logger.warn('Google Translation error, trying Lingva fallback:', e);
  }

  // Fallback 1: Lingva API (Google Translate proxy)
  try {
    const lingvaUrl = `https://lingva.ml/api/v1/auto/${targetLang}/${encodeURIComponent(text)}`;
    const lingvaRes = await fetchWithTimeout(lingvaUrl, {}, TRANSLATE_TIMEOUT_MS);
    if (lingvaRes.ok) {
      const lingvaData = await lingvaRes.json();
      if (lingvaData && lingvaData.translation) {
        return lingvaData.translation;
      }
    }
  } catch (e) {
    logger.warn('Lingva fallback error, trying MyMemory fallback:', e);
  }

  // Fallback 2: MyMemory API
  try {
    const myMemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`;
    const myMemoryRes = await fetchWithTimeout(myMemoryUrl, {}, TRANSLATE_TIMEOUT_MS);
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
    logger.error('All translation APIs failed:', e);
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
