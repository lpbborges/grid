const GLYPHS = '01#$%&*+<>/\\';
const PRESERVED = /[\s.…]/;

export function decodeFrame(final: string, progress: number, rand: () => number = Math.random) {
  if (progress >= 1) return final;
  const revealed = Math.floor(Math.max(progress, 0) * final.length);
  return [...final]
    .map((ch, i) =>
      i < revealed || PRESERVED.test(ch) ? ch : GLYPHS[Math.floor(rand() * GLYPHS.length)]
    )
    .join('');
}
