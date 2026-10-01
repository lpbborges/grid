const IMDB_TITLE_ID = /^tt\d+$/;

export function isImdbId(value: unknown): value is string {
  return typeof value === 'string' && IMDB_TITLE_ID.test(value);
}
