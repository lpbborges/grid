// Helpers for scripts/setup-libmpv.mjs, kept apart so vitest can test them.
import { lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * The DLLs to install from a Windows libmpv archive's bin/ listing, given as
 * the fs.Dirent entries of readdirSync(bin, { withFileTypes: true }).
 *
 * A DLL that is not a regular file is refused rather than skipped: a symlink
 * could copy an arbitrary host file into the installers, and silently
 * dropping a DLL would ship a closure that only fails on the user's machine.
 * Entries that are not DLLs are never copied, so their type does not matter.
 */
export function windowsRuntimeDlls(entries) {
  const dlls = entries.filter((entry) => /\.dll$/i.test(entry.name));
  for (const entry of dlls) {
    if (/[\\/]/.test(entry.name) || entry.name.startsWith('.')) {
      throw new Error(`unsafe DLL name: ${entry.name}`);
    }
    if (!entry.isFile()) throw new Error(`${entry.name} is not a regular file in the archive`);
  }
  const names = dlls.map((entry) => entry.name);
  if (!names.some((name) => name.toLowerCase() === 'libmpv-2.dll')) {
    throw new Error('libmpv-2.dll is missing from the archive');
  }
  return names.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

/**
 * Throws if anything under `dir` is a symlink. Run on the extracted archive
 * before copying from it, so a malformed or malicious archive cannot make the
 * copy pull in files from outside it. Links are never followed.
 */
export function assertNoSymlinks(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (lstatSync(full).isSymbolicLink()) {
      throw new Error(`the archive contains a symlink: ${full}`);
    }
    if (entry.isDirectory()) assertNoSymlinks(full);
  }
}

/**
 * Whether src-tauri/lib/windows already holds the lock entry's libmpv: the
 * stamp names its sha256 and the files the build needs are both present.
 */
export function isWindowsSetUp({ stamp, sha256, hasMpvLib, hasLibmpvDll }) {
  return stamp.trim() === sha256 && hasMpvLib && hasLibmpvDll;
}
