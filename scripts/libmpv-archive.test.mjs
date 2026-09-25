import { describe, expect, it } from 'vitest';
import { windowsRuntimeDlls } from './libmpv-archive.mjs';

describe('windowsRuntimeDlls', () => {
  it('keeps every DLL, sorted, and nothing else', () => {
    expect(
      windowsRuntimeDlls(['zlib1.dll', 'libmpv-2.dll', 'README.txt', 'AVCODEC-61.DLL', 'mpv.def'])
    ).toEqual(['AVCODEC-61.DLL', 'libmpv-2.dll', 'zlib1.dll']);
  });

  it('refuses names that could escape the target directory', () => {
    expect(() => windowsRuntimeDlls(['../evil.dll'])).toThrow(/unsafe/);
    expect(() => windowsRuntimeDlls(['sub\\evil.dll'])).toThrow(/unsafe/);
  });

  it('requires libmpv-2.dll', () => {
    expect(() => windowsRuntimeDlls(['zlib1.dll'])).toThrow(/libmpv-2\.dll/);
  });
});
