// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertNoSymlinks, windowsRuntimeDlls } from './libmpv-archive.mjs';

/** A minimal stand-in for the fs.Dirent that readdirSync(..., { withFileTypes: true }) returns. */
function entry(name, kind = 'file') {
  return {
    name,
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'dir',
    isSymbolicLink: () => kind === 'symlink'
  };
}

const files = (...names) => names.map((name) => entry(name));

describe('windowsRuntimeDlls', () => {
  it('keeps every DLL, sorted, and nothing else', () => {
    expect(
      windowsRuntimeDlls(
        files('zlib1.dll', 'libmpv-2.dll', 'README.txt', 'AVCODEC-61.DLL', 'mpv.def')
      )
    ).toEqual(['AVCODEC-61.DLL', 'libmpv-2.dll', 'zlib1.dll']);
  });

  it('sorts case-insensitively', () => {
    expect(windowsRuntimeDlls(files('Zeta.dll', 'libmpv-2.dll', 'avcodec.dll'))).toEqual([
      'avcodec.dll',
      'libmpv-2.dll',
      'Zeta.dll'
    ]);
  });

  it('refuses names that could escape the target directory', () => {
    expect(() => windowsRuntimeDlls(files('../evil.dll'))).toThrow(/unsafe/);
    expect(() => windowsRuntimeDlls(files('sub\\evil.dll'))).toThrow(/unsafe/);
    expect(() => windowsRuntimeDlls(files('.evil.dll', 'libmpv-2.dll'))).toThrow(/unsafe/);
  });

  it('requires libmpv-2.dll, in any case', () => {
    expect(() => windowsRuntimeDlls(files('zlib1.dll'))).toThrow(/libmpv-2\.dll/);
    expect(windowsRuntimeDlls(files('LIBMPV-2.DLL'))).toEqual(['LIBMPV-2.DLL']);
  });

  it('refuses a DLL that is not a regular file', () => {
    expect(() =>
      windowsRuntimeDlls([entry('libmpv-2.dll'), entry('zlib1.dll', 'symlink')])
    ).toThrow(/zlib1\.dll is not a regular file/);
    expect(() => windowsRuntimeDlls([entry('libmpv-2.dll'), entry('odd.dll', 'dir')])).toThrow(
      /odd\.dll is not a regular file/
    );
  });

  it('ignores entries that are not DLLs, whatever their type', () => {
    expect(
      windowsRuntimeDlls([entry('libmpv-2.dll'), entry('share', 'dir'), entry('mpv', 'symlink')])
    ).toEqual(['libmpv-2.dll']);
  });
});

describe('assertNoSymlinks', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'grid-archive-test-'));
    mkdirSync(path.join(dir, 'LICENSES', 'libass'), { recursive: true });
    writeFileSync(path.join(dir, 'LICENSES', 'libass', 'COPYING'), 'ISC');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('accepts a tree of regular files and directories', () => {
    expect(() => assertNoSymlinks(dir)).not.toThrow();
  });

  it('refuses a symlink to a file, however deep', () => {
    symlinkSync('/etc/passwd', path.join(dir, 'LICENSES', 'libass', 'passwd'));
    expect(() => assertNoSymlinks(dir)).toThrow(/symlink.*LICENSES[\\/]libass[\\/]passwd/);
  });

  it('refuses a symlink to a directory without following it', () => {
    symlinkSync('/', path.join(dir, 'LICENSES', 'root'));
    expect(() => assertNoSymlinks(dir)).toThrow(/symlink.*LICENSES[\\/]root/);
  });
});
