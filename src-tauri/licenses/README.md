# Bundled third-party software

Grid itself is MIT licensed (see `LICENSE` at the repository root).

## libmpv

### How Grid uses it

On Linux and Windows, Grid **dynamically links libmpv and runs it in-process**
(`src-tauri/src/player/`). There is no separate mpv process. macOS never links
libmpv; it plays through the `<video>` element.

Because libmpv is linked into Grid's own process, its licence applies to what
Grid ships, not just to a separate program Grid happens to launch:

- mpv is GPLv2+ by default and LGPLv2.1+ when built with `-Dgpl=false`
  (mpv's `Copyright` file).
- FFmpeg is LGPLv2.1+ by default and only becomes GPL via `--enable-gpl`
  (https://www.ffmpeg.org/legal.html).

Linking a GPL libmpv would make the distributed Grid binary a GPL derivative.
Dynamically linking an **LGPL-2.1-or-later** one keeps Grid's own code MIT,
provided users can swap in their own build of the library (see
[Replacing the library](#replacing-the-library)).

### The rule

- **Grid must only ever ship an LGPL-2.1-or-later libmpv build.** Never a GPL
  build, on any platform.
- **Development may link the system libmpv.** On Linux that is the
  distribution's package (`libmpv-dev`, or Arch's `mpv`), which is usually a GPL
  build. That is fine for a local build nobody receives; release packages never
  link it: they link and ship the pinned LGPL build below.
- Both platforms' builds are pinned by URL and SHA256 in
  `scripts/libmpv.lock.json` and fetched by `npm run setup:libmpv`
  (`--bundle` on Linux). Each pinned artifact is a never-overwritten prerelease in
  Grid's own repository, so a pin never disappears from under a release.

### What an LGPL build gives up

What GPL buys in an mpv build is nothing Grid uses:

- **Encoders** — `libx264`, `libx265`, `libxvid`. Grid decodes; it never encodes.
- **GPL-only filters** — the `pp`/`spp`/`uspp` postprocessing family, `delogo`,
  `owdenoise`. Grid applies none of them, and initialises libmpv with
  `config=no` and `load-scripts=no`, so a user's own configuration cannot reach
  it either.
- **GPL-only mpv subsystems** — X11 video output, OSS audio, NVIDIA vdpau. Grid
  draws through libmpv's render API on Linux and `gpu-api=d3d11` on Windows.

Nothing in the decode path is GPL. H.264, HEVC, VP9, AV1, AC3, E-AC3, DTS and
AAC decoding is FFmpeg's own LGPL code, `d3d11va` (Windows) and VA-API (Linux)
hardware decoding are core, and libass (subtitle rendering) is ISC.

### Linux: built by Grid

`.github/workflows/build-libmpv-linux.yml` builds mpv (`-Dgpl=false`), FFmpeg
(no `--enable-gpl`, no `--enable-nonfree`), libplacebo, dav1d and
libdisplay-info from their upstream tags as shared libraries on Ubuntu 24.04
(glibc 2.39, the floor the Grid binary itself needs), asserts the LGPL
configuration from the configured builds themselves, and publishes the result
as a never-overwritten prerelease:

- **Release:** [`libmpv-linux-v0.41.0-b5`](https://github.com/lpbborges/grid/releases/tag/libmpv-linux-v0.41.0-b5),
  asset `libmpv-linux-x86_64.tar.gz`
- **Built by:** [workflow run 5](https://github.com/lpbborges/grid/actions/runs/36009061457),
  from commit `70b23a5e6fe1b15b8489f52b582b7f2e6f6fef22`
- **SHA256:** `b06668787b56b6e4c385cea8ed17c77c48fef6383fdaa215c16d678b32a5a8c2`
- **Licence:** LGPL-2.1-or-later (dav1d: BSD-2-Clause; libdisplay-info: MIT,
  with a PNP ID table generated from hwdata's `pnp.ids`, used under its
  XFree86 licence option)

**Hardware decoding:** VA-API (Intel and AMD GPUs, or any GPU with a VA-API
driver). mpv opens a DRM render node (`vaapi-drm`) and hands decoded frames to Grid's
OpenGL context as dma-bufs (`dmabuf-interop-gl`, through EGL). The build fails
unless mpv's enabled features include `gl`, `egl`, `drm`, `vaapi`, `vaapi-drm`
and `dmabuf-interop-gl`, and never includes `gpl` or `x11`; `BUILD-INFO.txt`
records them. mpv's X11 support (and with it `vaapi-x11` and VDPAU) is GPL-only
and stays off; Wayland is off because Grid does not pass mpv a Wayland display.
When hardware decoding is unavailable, `hwdec=auto-safe` falls back to software
decoding.

The archive's `BUILD-INFO.txt` (also the release notes) records the exact
upstream revisions and the flags each one was built with:

| Component       | Tag        | Commit                                     | Built with                                                                                                                                                                                                                                                        |
| --------------- | ---------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mpv             | `v0.41.0`  | `41f6a645068483470267271e1d09966ca3b9f413` | `meson setup -Dgpl=false -Dlibmpv=true -Dcplayer=false -Dlua=disabled -Djavascript=disabled -Djpeg=disabled -Dlcms2=disabled -Dvaapi=enabled -Dvaapi-drm=enabled -Ddrm=enabled -Degl=enabled -Dx11=disabled -Dwayland=disabled -Dgbm=disabled -Degl-drm=disabled` |
| FFmpeg          | `n7.1`     | `b08d7969c550a804a59511c7b83f2dd8cc0499b8` | `configure --enable-shared --disable-static --disable-programs --disable-doc --disable-debug --enable-libdav1d --enable-vaapi --disable-bzlib --disable-lzma`                                                                                                     |
| libplacebo      | `v7.351.0` | `3188549fba13bbdf3a5a98de2a38c2e71f04e21e` | `meson setup -Dvulkan=enabled -Dopengl=enabled -Dshaderc=disabled -Dglslang=enabled -Dlcms=disabled -Ddemos=false -Dtests=false`                                                                                                                                  |
| dav1d           | `1.5.1`    | `42b2b24fb8819f1ed3643aa9cf2a62f03868e3aa` | `meson setup --buildtype=release -Denable_tools=false -Denable_tests=false -Denable_examples=false`                                                                                                                                                               |
| libdisplay-info | `0.2.0`    | `66b802d05b374cd8f388dc6ad1e7ae4f08cb3300` | `meson setup --buildtype=release` (PNP IDs from Ubuntu's `hwdata` 0.379-1)                                                                                                                                                                                        |

### Windows: the mirrored `mpv-dev-lgpl` DLL

The Windows build links a prebuilt `libmpv-2.dll` from the community
[`zhongfly/mpv-winbuild`](https://github.com/zhongfly/mpv-winbuild) project
(which builds with [`shinchiro/mpv-winbuild-cmake`](https://github.com/shinchiro/mpv-winbuild-cmake)).
That repository is a rolling nightly that publishes a build per mpv commit and
may drop old tags, so Grid mirrors the exact archive, unchanged:

- **Mirror:** [`libmpv-windows-2026-09-23-bdefd6cb42`](https://github.com/lpbborges/grid/releases/tag/libmpv-windows-2026-09-23-bdefd6cb42),
  asset `mpv-dev-lgpl-x86_64-20260923-git-bdefd6cb42.7z`
- **Upstream:** tag [`2026-09-23-bdefd6cb42`](https://github.com/zhongfly/mpv-winbuild/releases/tag/2026-09-23-bdefd6cb42)
  of `zhongfly/mpv-winbuild`, built by its
  [workflow run 35871217838](https://github.com/zhongfly/mpv-winbuild/actions/runs/35871217838)
  from mpv commit [`bdefd6cb4284b35d6d902ef82a0322e0b684f21c`](https://github.com/mpv-player/mpv/commit/bdefd6cb4284b35d6d902ef82a0322e0b684f21c)
  (`v0.41.0-1070-gbdefd6cb4`)
- **SHA256:** `f44eb9a2e3a187af66e16bd7d8be37bfa46ac0c894297145937bab9116f2aec1`
  (identical upstream and in the mirror)
- **Licence:** LGPL-2.1-or-later

Checked when it was pinned, and again when it was mirrored:

- `strings libmpv-2.dll | grep -c -- '--enable-gpl'` prints `0`, and so does
  `--enable-nonfree`: FFmpeg's recorded configuration is neither GPL nor
  non-free.
- The licence notices embedded in the DLL are the LGPL 2.1 "or (at your option)
  any later version" wording throughout; `grep -ci 'GNU General Public License'`
  prints `0`.
- The archive ships no `mpv.def`, so `setup:libmpv` generates the import
  library from the DLL's export table.

Community LGPL builds carry their authors' own disclaimer that they cannot
guarantee every LGPL-incompatible component was disabled, so the checks above
are evidence, not a guarantee.

## Source offer

The LGPL requires the corresponding source of the library Grid distributes.
For each package it is:

- **Linux:** the upstream sources at the commits in the table above, built by
  `.github/workflows/build-libmpv-linux.yml` at commit
  `70b23a5e6fe1b15b8489f52b582b7f2e6f6fef22` with the listed flags. The
  release [`libmpv-linux-v0.41.0-b5`](https://github.com/lpbborges/grid/releases/tag/libmpv-linux-v0.41.0-b5)
  holds the exact binaries and their `BUILD-INFO.txt`. The `.deb` and `.rpm`
  ship those binaries unchanged, and the AppImage's copies are identical too.
- **Windows:** the upstream build recipe at tag `2026-09-23-bdefd6cb42` of
  [`zhongfly/mpv-winbuild`](https://github.com/zhongfly/mpv-winbuild) (on top of
  `shinchiro/mpv-winbuild-cmake`), mpv commit
  `bdefd6cb4284b35d6d902ef82a0322e0b684f21c`, with the dependency revisions its
  build run records. The mirror
  [`libmpv-windows-2026-09-23-bdefd6cb42`](https://github.com/lpbborges/grid/releases/tag/libmpv-windows-2026-09-23-bdefd6cb42)
  holds the exact archive. This source record is provisional: it relies on
  the upstream build recipe and its build run's logs, which can expire. A
  durable source archive is a pending pre-release item.

To request the complete corresponding source for the build shipped in any Grid
release, open an issue on the Grid repository.

## Replacing the library

libmpv is never linked statically. Each package installs it as a separate
shared library that Grid loads at startup, so users can replace it with their
own build (for example, one compiled from the sources above) — that is the
LGPL's relinking requirement:

- **Linux `.deb` / `.rpm`:** `/usr/lib/grid/libmpv.so.2` (and the FFmpeg,
  libplacebo, dav1d and libdisplay-info libraries beside it). The binary's RUNPATH is
  `$ORIGIN/../lib/grid`, then `$ORIGIN/../lib`.
- **Linux AppImage:** `usr/lib/libmpv.so.2` inside the image; extract it with
  `--appimage-extract`, replace the file and run `squashfs-root/AppRun`.
- **Windows:** `libmpv-2.dll` beside `grid.exe` in the install directory.

A replacement must provide the same libmpv client API under the same file name
(`libmpv.so.2` / `libmpv-2.dll`).

## Licence texts shipped with each package

- **Linux (`.deb`, `.rpm`, AppImage):** `usr/lib/grid/LICENSES/`, copied from
  the Linux artifact: `mpv-LGPL-2.1.txt`, `ffmpeg-LGPL-2.1.txt`,
  `libplacebo-LGPL-2.1.txt`, `dav1d-BSD-2.txt`, `libdisplay-info-MIT.txt` and
  `hwdata-copyright.txt`.
- **Windows (MSI and NSIS):** `LICENSES\` in the install directory, beside
  `grid.exe` and `libmpv-2.dll`. The Windows archive ships no licence text, so
  these are the same first four files (the Windows DLL has no libdisplay-info), copied from the Linux artifact's `LICENSES/`
  into [`libmpv/`](libmpv/) and bundled by `src-tauri/tauri.windows.conf.json`.

Nothing here is legal advice; the distribution obligations above need review by
someone qualified before the first release that bundles libmpv.
