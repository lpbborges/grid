import type { Chapter } from '$lib/types';

const INTRO_TITLE = /^(intro|opening( credits)?|op\d*|abertura|title sequence|main titles?)$/i;
const MAX_INTRO_SECONDS = 240;

/** The intro taken from a chapter named like one, or `null`: it is never guessed. */
export function findIntro(chapters: Chapter[]): { start: number; end: number } | null {
  const index = chapters.findIndex((chapter) => INTRO_TITLE.test(chapter.title?.trim() ?? ''));
  if (index === -1) return null;
  const start = chapters[index].time;
  const end = chapters[index + 1]?.time;
  if (end === undefined || end <= start || end - start > MAX_INTRO_SECONDS) return null;
  return { start, end };
}
