// Pure helpers for scripts/setup-libmpv.mjs, kept apart so vitest can test them.

/** The DLLs to install from a Windows libmpv archive's bin/ listing. */
export function windowsRuntimeDlls(names) {
  const dlls = names.filter((name) => /\.dll$/i.test(name));
  for (const name of dlls) {
    if (/[\\/]/.test(name) || name.startsWith('.')) throw new Error(`unsafe DLL name: ${name}`);
  }
  if (!dlls.some((name) => name.toLowerCase() === 'libmpv-2.dll')) {
    throw new Error('libmpv-2.dll is missing from the archive');
  }
  return dlls.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}
