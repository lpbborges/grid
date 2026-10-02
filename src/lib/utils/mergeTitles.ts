import type { MediaType, Movie, SearchResult } from '$lib/types';

export type MergeCriterion = 'rating' | 'releaseDate';

interface Candidate {
  title: SearchResult;
  position: number;
}

/** Descending, with titles that have no value after the ones that do. */
function byDescending(a: number | undefined, b: number | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return b - a;
}

const known = (value: number) => (value > 0 ? value : undefined);

function releaseTime(title: Movie): number | undefined {
  const time = title.releaseDate ? Date.parse(title.releaseDate) : NaN;
  return Number.isNaN(time) ? undefined : time;
}

const compare: Record<MergeCriterion, (a: Candidate, b: Candidate) => number> = {
  rating: (a, b) => byDescending(known(a.title.rating), known(b.title.rating)),
  releaseDate: (a, b) =>
    byDescending(releaseTime(a.title), releaseTime(b.title)) ||
    byDescending(known(a.title.year), known(b.title.year))
};

const tagged = (titles: Movie[], type: MediaType): Candidate[] =>
  titles.map((title, position) => ({ title: { ...title, type }, position }));

/**
 * One list out of a movie and a series catalog, ordered by `criterion` rather than alternated.
 * Ties follow the position in the catalog a title came from, movies first; titles with no
 * rating or date come last.
 */
export function mergeTitles(
  movies: Movie[],
  series: Movie[],
  criterion: MergeCriterion
): SearchResult[] {
  return [...tagged(movies, 'movie'), ...tagged(series, 'series')]
    .sort((a, b) => compare[criterion](a, b) || a.position - b.position)
    .map(({ title }) => title);
}
