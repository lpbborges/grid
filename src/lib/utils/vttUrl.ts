/** An object URL for WebVTT text, for a `<track>` to load. */
export function vttObjectUrl(vtt: string): string {
  return URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
}
