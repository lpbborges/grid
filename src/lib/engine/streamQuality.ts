/** Cinema recordings, screeners and 3D releases: never worth playing. */
const LOW_QUALITY_TAGS = new Set([
  'cam',
  'camrip',
  'hdcam',
  'ts',
  'hdts',
  'telesync',
  'tc',
  'hdtc',
  'telecine',
  'scr',
  'screener',
  'dvdscr',
  'r5',
  'workprint',
  '3d',
  'sbs',
  'hsbs'
]);

// Where a release name stops being the title and starts being tags: Title.2024.CAM, Show.S01E02.TS.
const END_OF_TITLE = /^(?:(?:19|20)\d{2}|s\d{1,2}(?:e\d{1,3})?)$/;

const tokens = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u);

function releaseTags(title: string): string[] {
  const words = tokens(title);
  const end = words.findIndex((word) => END_OF_TITLE.test(word));
  return end === -1 ? words : words.slice(end + 1);
}

/** Tells whether a stream's name or title marks it as a cinema recording, a screener or 3D. */
export function isLowQuality(stream: { name?: string; title?: string }): boolean {
  return [...tokens(stream.name ?? ''), ...releaseTags(stream.title ?? '')].some((word) =>
    LOW_QUALITY_TAGS.has(word)
  );
}
