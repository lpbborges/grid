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
- **Grid only ships a build whose complete corresponding source it publishes
  itself**, beside the binaries, with the notice of everything compiled into
  it — statically linked dependencies included.
- **Development may link the system libmpv.** On Linux that is the
  distribution's package (`libmpv-dev`, or Arch's `mpv`), which is usually a GPL
  build. That is fine for a local build nobody receives; release packages never
  link it: they link and ship the pinned LGPL build below.
- Both platforms' builds are pinned by URL and SHA256 in
  `scripts/libmpv.lock.json` and fetched by `npm run setup:libmpv`
  (`--bundle` on Linux).

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

- **Release:** [`libmpv-linux-v0.41.0-b7`](https://github.com/lpbborges/grid/releases/tag/libmpv-linux-v0.41.0-b7),
  asset `libmpv-linux-x86_64.tar.gz`, with its complete source in
  `libmpv-linux-source.tar.xz`
- **Built by:** [workflow run 7](https://github.com/lpbborges/grid/actions/runs/36039471424),
  from commit `f4fb7f6f6c95e8f7738feada5d0bf2baab9c1546`
- **SHA256:** `5f7373d9074c9d65257fd78f5e11e89a15b6320c0551730cd6a5daff8b5af0b6`
- **Licence:** LGPL-2.1-or-later (dav1d: BSD-2-Clause; libdisplay-info: MIT).
  `libplacebo.so` also contains, statically, glslang and SPIRV-Tools (Ubuntu
  24.04's packages; BSD/MIT/Apache-2.0, plus glslang's GPL-3.0 Bison parser
  under the Bison exception), the SPIR-V headers' tables, fast_float (MIT), a
  glad-generated GL loader (MIT, Khronos Apache-2.0) and Vulkan-Headers
  (Apache-2.0 OR MIT). Their notices are in `LICENSES/`.
- **Monitor names:** libdisplay-info is built from an **empty** PNP ID table
  rather than hwdata's `pnp.ids`, whose licence is ambiguous (its `LICENSE`
  offers GPL-2.0-or-later or XFree86 1.0, its package spec says
  GPL-2.0-or-later only). Vendors print as their PNP code (`PNP(ACR)` instead
  of "Acer Technologies"); nothing in playback uses the name.

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
| libdisplay-info | `0.2.0`    | `66b802d05b374cd8f388dc6ad1e7ae4f08cb3300` | `meson setup --buildtype=release` (empty PNP ID table)                                                                                                                                                                                                            |

### Windows: not shipped yet

**Windows releases are paused** (`release.yml` has no Windows leg). Windows
development and CI link a community build, but Grid must not distribute it:

- **What it is:** `mpv-dev-lgpl-x86_64-20260923-git-bdefd6cb42.7z` from tag
  [`2026-09-23-bdefd6cb42`](https://github.com/zhongfly/mpv-winbuild/releases/tag/2026-09-23-bdefd6cb42)
  of `zhongfly/mpv-winbuild` (SHA256
  `f44eb9a2e3a187af66e16bd7d8be37bfa46ac0c894297145937bab9116f2aec1`), built by
  [run 35871217838](https://github.com/zhongfly/mpv-winbuild/actions/runs/35871217838)
  with `shinchiro/mpv-winbuild-cmake` at `05a60b3cfd04e3e3b89918f4a27f3dde2935dff2`
  plus zhongfly's `compile-lgpl-libmpv.patch`.
- **Why it cannot ship:** one 100 MB DLL statically linking **74 components**.
  Its FFmpeg is configured with `--enable-version3`, so it is
  **LGPL-3.0-or-later** (the build log says `License: LGPL version 3 or later`),
  not 2.1. The build takes most packages from a cached git checkout and
  records no revision for them, so the exact corresponding source cannot be
  reconstructed. Components with source obligations include mpv, FFmpeg,
  libplacebo, LAME, libbluray, libsoxr, FriBidi, libiconv, OpenAL Soft, libssh,
  libudfread, uchardet and subrandr (MPL-2.0).
- **Earlier evidence was vacuous:** `strings libmpv-2.dll | grep -- --enable-gpl`
  printed 0 because the DLL holds no FFmpeg configure string at all (dropped at
  link time), not because the configuration was checked.

Grid will build its own Windows libmpv (LGPL-2.1, a small set of shared
DLLs, published with its source) before Windows releases resume. CI's
`package-windows` job still builds the installers to check their layout, but
no longer uploads them.

## Source

The LGPL requires the complete corresponding source of the library Grid
distributes, offered from the same place as the binaries. For the Linux
packages it is `libmpv-linux-source.tar.xz` in the same release as the pinned
binaries (see above): the exact source trees of mpv, FFmpeg, libplacebo (with
its submodules), dav1d and libdisplay-info, taken before anything was built,
plus the workflow that built them. `release.yml` links it from every Grid
release and refuses to publish if it is missing. The superseded build
`libmpv-linux-v0.41.0-b5` carries its own source archive, assembled afterwards
from the commits its `BUILD-INFO.txt` records, including the hwdata source
package its PNP ID table came from.

If any of those links stops working, open an issue on the Grid repository and
the complete corresponding source for the build shipped in any Grid release
will be provided, for at least three years after that release.

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

A replacement must provide the same libmpv client API under the same file name
(`libmpv.so.2`).

## Licence texts shipped with each package

- **Linux (`.deb`, `.rpm`, AppImage):** `usr/lib/grid/LICENSES/`, copied from
  the Linux artifact: `mpv-LGPL-2.1.txt`, `ffmpeg-LGPL-2.1.txt`,
  `libplacebo-LGPL-2.1.txt`, `dav1d-BSD-2.txt`, `libdisplay-info-MIT.txt`,
  `glslang-copyright.txt`, `glslang-LICENSE.txt` (with the Bison exception),
  `Apache-2.0.txt`, `spirv-tools-copyright.txt`,
  `spirv-headers-copyright.txt`, `fast_float-MIT.txt`,
  `glad-MIT-and-Khronos.txt` and the three `Vulkan-Headers-*` files. CI's
  `package-linux` job fails if any is missing from a package.
- **Windows:** none yet (not shipped; see above).

Nothing here is legal advice. The obligations above were checked against the
licence texts, not reviewed by a lawyer.
