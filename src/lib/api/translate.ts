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
