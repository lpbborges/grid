/** Posters for titles whose Cinemeta/metahub image shows a different title. */
const POSTER_OVERRIDES: Record<string, string> = {
  tt0185906:
    'https://m.media-amazon.com/images/M/MV5BYjdlNGJlYjQtMDU2Mi00ZjA1LWEwYzgtYzlmNDM5MmE1ZGUwXkEyXkFqcGc@._V1_SX250.jpg'
};

export function correctedPoster<T extends string | undefined>(id: string, poster: T): T | string {
  return POSTER_OVERRIDES[id] ?? poster;
}
