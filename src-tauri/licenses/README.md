# Bundled third-party software

Grid itself is MIT licensed (see `LICENSE` at the repository root).

## libmpv

On Linux and Windows, Grid **dynamically links libmpv and runs it in-process**
(`src-tauri/src/player/`). macOS never links libmpv; it plays through the
`<video>` element.

mpv is GPL by default and LGPL-2.1-or-later when built with `-Dgpl=false`;
FFmpeg is LGPL unless built with `--enable-gpl`. Linking a GPL build would make
Grid a GPL derivative, so:

- **Grid only ships an LGPL-2.1-or-later libmpv**, built by Grid itself:
  `.github/workflows/build-libmpv-linux.yml` and
  `.github/workflows/build-libmpv-windows.yml`. Both fail if mpv or FFmpeg was
  configured as GPL, and publish a never-overwritten prerelease holding the
  binaries, the licence texts (`LICENSES/`), a `BUILD-INFO.txt` with the exact
  revisions and flags, and the complete source (`libmpv-*-source.tar.xz`).
- The builds Grid uses are pinned by URL and SHA256 in
  `scripts/libmpv.lock.json`.
- **Development may link the system libmpv** on Linux (usually a GPL build).
  That is fine for a local build nobody receives; release packages never link
  it.

On Windows the archive also carries the MSYS2 DLLs libmpv loads; their licence
files ship in `LICENSES/<package>/`, and the MSYS2 source packages of the LGPL
ones are in the source archive.

## Source

The LGPL requires the library's complete source to be offered from the same
place as the binaries. It is the `libmpv-linux-source.tar.xz` /
`libmpv-windows-source.tar.xz` asset of the pinned prerelease, and `release.yml`
links both from every Grid release.

**Never delete or edit a `libmpv-*` prerelease that a published Grid release
pinned** (check with `git show <tag>:scripts/libmpv.lock.json`): it is where
that release's source is offered.

## Replacing the library

libmpv is never linked statically, so users can swap in their own build (the
LGPL's relinking requirement). It must provide the same libmpv client API under
the same file name:

- **Linux `.deb` / `.rpm`:** `/usr/lib/grid/libmpv.so.2`, with the libraries it
  needs beside it. The binary's RUNPATH is `$ORIGIN/../lib/grid`, then
  `$ORIGIN/../lib`.
- **Linux AppImage:** `usr/lib/libmpv.so.2` inside the image; extract it with
  `--appimage-extract`, replace the file and run `squashfs-root/AppRun`.
- **Windows (MSI, NSIS):** `libmpv-2.dll` and every DLL it loads sit beside
  `grid.exe`; Windows loads DLLs from the executable's directory first.

## Licence texts shipped with each package

- **Linux:** `usr/lib/grid/LICENSES/`.
- **Windows:** `LICENSES\` beside `grid.exe`.

Both are copied from the pinned archive's `LICENSES/`.

**FreeType (Windows):** Portions of this software are copyright © 2026 The
FreeType Project (www.freetype.org). All rights reserved.

Nothing here is legal advice.
