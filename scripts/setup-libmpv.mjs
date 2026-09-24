// Downloads the pinned LGPL libmpv for this platform into src-tauri/lib/<os>/.
//
// Windows: always needed to build (libmpv-2.dll + an MSVC import library).
// Linux: only with --bundle (release packaging, Task 9); development links the
// system libmpv. macOS: nothing to do, it plays through <video>.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
  copyFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const lock = JSON.parse(readFileSync(path.join(root, 'scripts', 'libmpv.lock.json'), 'utf8'));
const bundle = process.argv.includes('--bundle');

async function fetchVerified(entry, dest) {
  const response = await fetch(entry.url);
  if (!response.ok) throw new Error(`download failed: ${response.status} ${entry.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== entry.sha256) {
    throw new Error(`checksum mismatch for ${entry.url}: expected ${entry.sha256}, got ${actual}`);
  }
  writeFileSync(dest, bytes);
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

function msvcTool(name) {
  const vswhere = path.join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe'
  );
  const found = execFileSync(vswhere, ['-latest', '-find', `**/Hostx64/x64/${name}`], {
    encoding: 'utf8'
  })
    .split(/\r?\n/)
    .find(Boolean);
  if (!found) throw new Error(`${name} not found; install the MSVC build tools`);
  return found;
}

/** Builds a .def from the DLL's export table when the archive ships none. */
function defFromExports(dll, defPath) {
  const out = execFileSync(msvcTool('dumpbin.exe'), ['/exports', dll], { encoding: 'utf8' });
  const names = out
    .split(/\r?\n/)
    .map((line) => /^\s+\d+\s+[0-9A-F]+\s+[0-9A-F]{8}\s+(\S+)/.exec(line)?.[1])
    .filter(Boolean);
  if (names.length === 0) throw new Error('no exports found in libmpv-2.dll');
  writeFileSync(defPath, `LIBRARY libmpv-2\nEXPORTS\n${names.map((n) => `  ${n}`).join('\n')}\n`);
}

/** Records which lock entry the extracted files came from. */
const STAMP = '.libmpv-sha256';

/** The ELF DT_SONAME of a shared library, e.g. "libmpv.so.2". */
function sonameOf(file) {
  const out = execFileSync('readelf', ['-d', file], { encoding: 'utf8' });
  const match = /Library soname: \[(.+?)\]/.exec(out);
  if (!match) throw new Error(`${file} has no DT_SONAME`);
  return match[1];
}

/**
 * Package Linux release builds must ship exactly one file per shared library
 * SONAME, never the dev-symlink (`libmpv.so`) or the full-version file
 * (`libmpv.so.2.5.0`) alongside it — those triple the installed size for no
 * runtime benefit. `linkDir` (used to link the Rust binary, see build.rs)
 * keeps the full set; this rebuilds `runtimeDir` from scratch as the pruned
 * set the packages actually install.
 */
function buildRuntimeDir(linkDir, runtimeDir) {
  rmSync(runtimeDir, { recursive: true, force: true });
  mkdirSync(runtimeDir, { recursive: true });
  // A symlink chain that escapes linkDir (a malformed or malicious archive)
  // must not be silently followed into an arbitrary path on disk.
  const resolvedLinkDir = realpathSync(linkDir);
  const seen = new Set();
  for (const entry of readdirSync(linkDir, { withFileTypes: true })) {
    if (entry.name === STAMP || entry.name === 'LICENSES') continue;
    const real = realpathSync(path.join(linkDir, entry.name));
    if (real !== resolvedLinkDir && !real.startsWith(resolvedLinkDir + path.sep)) {
      throw new Error(`${entry.name} resolves outside ${linkDir}: ${real}`);
    }
    const soname = sonameOf(real);
    if (seen.has(soname)) continue;
    seen.add(soname);
    copyFileSync(real, path.join(runtimeDir, soname));
  }
  execFileSync('cp', ['-a', path.join(linkDir, 'LICENSES'), path.join(runtimeDir, 'LICENSES')], {
    stdio: 'inherit'
  });
}

async function setupWindows() {
  const entry = lock['windows-x86_64'];
  const out = path.join(root, 'src-tauri', 'lib', 'windows');
  const stamp = path.join(out, STAMP);
  const current = existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : '';
  if (
    current === entry.sha256 &&
    existsSync(path.join(out, 'mpv.lib')) &&
    existsSync(path.join(out, 'libmpv-2.dll'))
  ) {
    console.log('libmpv already set up in', out);
    return;
  }
  if (current && current !== entry.sha256) {
    console.log('libmpv.lock.json changed; replacing the libmpv in', out);
  }
  mkdirSync(out, { recursive: true });
  const work = mkdtempSync(path.join(tmpdir(), 'grid-libmpv-'));
  try {
    const archive = path.join(work, 'libmpv.7z');
    await fetchVerified(entry, archive);
    execFileSync('7z', ['x', archive, `-o${work}`, '-y'], { stdio: 'inherit' });

    const dll = findFile(work, 'libmpv-2.dll');
    if (!dll) throw new Error('libmpv-2.dll not found in the archive');
    copyFileSync(dll, path.join(out, 'libmpv-2.dll'));

    const def = findFile(work, 'mpv.def') ?? path.join(work, 'mpv.def');
    if (!existsSync(def)) defFromExports(dll, def);
    execFileSync(
      msvcTool('lib.exe'),
      [`/def:${def}`, `/out:${path.join(out, 'mpv.lib')}`, '/machine:x64', '/name:libmpv-2.dll'],
      { stdio: 'inherit' }
    );
    // Written last: a run that fails halfway leaves no stamp, so the next
    // run starts over instead of trusting a partial set of files.
    writeFileSync(stamp, `${entry.sha256}\n`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  console.log('libmpv set up in', out);
}

async function setupLinuxBundle() {
  const entry = lock['linux-x86_64'];
  // lib/linux: the full archive contents (symlinks + full-version files),
  // used only to link the Rust binary at build time (build.rs).
  // lib/linux-runtime: one real file per SONAME, which is what actually gets
  // installed by the .deb/.rpm/AppImage — see buildRuntimeDir.
  const out = path.join(root, 'src-tauri', 'lib', 'linux');
  const runtimeOut = path.join(root, 'src-tauri', 'lib', 'linux-runtime');
  const stamp = path.join(out, STAMP);
  const current = existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : '';
  if (
    current === entry.sha256 &&
    existsSync(path.join(out, 'libmpv.so.2')) &&
    existsSync(path.join(runtimeOut, 'libmpv.so.2'))
  ) {
    console.log('bundled libmpv already set up in', out, 'and', runtimeOut);
    return;
  }
  if (current && current !== entry.sha256) {
    console.log('libmpv.lock.json changed; replacing the bundled libmpv in', out);
  }
  // Clear the stamp and both directories before extracting: `cp -a` alone
  // only overwrites files the new archive still has under the same name, so
  // a file dropped or renamed between releases (e.g. libavcodec.so.60 ->
  // .so.61) would otherwise survive, and buildRuntimeDir could then ship it
  // under a current SONAME depending on directory read order. Doing this
  // before the stamp is rewritten means an interrupted run leaves neither a
  // stamp nor a stale directory to trust.
  rmSync(stamp, { force: true });
  rmSync(out, { recursive: true, force: true });
  rmSync(runtimeOut, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const work = mkdtempSync(path.join(tmpdir(), 'grid-libmpv-'));
  try {
    const archive = path.join(work, 'libmpv.tar.gz');
    await fetchVerified(entry, archive);
    execFileSync('tar', ['-xzf', archive, '-C', work], { stdio: 'inherit' });
    execFileSync('cp', ['-a', `${path.join(work, 'lib')}/.`, out], { stdio: 'inherit' });
    execFileSync('cp', ['-a', path.join(work, 'LICENSES'), path.join(out, 'LICENSES')], {
      stdio: 'inherit'
    });
    buildRuntimeDir(out, runtimeOut);
    // Written last: a run that fails halfway leaves no stamp, so the next
    // run starts over instead of trusting a partial set of files.
    writeFileSync(stamp, `${entry.sha256}\n`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  console.log('bundled libmpv set up in', out, 'and', runtimeOut);
}

if (process.platform === 'win32') {
  await setupWindows();
} else if (process.platform === 'linux' && bundle) {
  await setupLinuxBundle();
} else {
  console.log('Nothing to do: this platform links the system libmpv or does not use it.');
}
