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

### Windows: built by Grid

**Windows releases are still off** (`release.yml` has no Windows leg). They
return once FFmpeg has been bumped to `n7.1.5` and re-pinned for both
platforms, and the installer has been checked on a clean Windows machine.
Until then, CI's `package-windows` job builds the installers against this build
to check their layout, but does not upload them.

`.github/workflows/build-libmpv-windows.yml` builds mpv (`-Dgpl=false`), FFmpeg
(no `--enable-gpl`, `--enable-version3` or `--enable-nonfree`) and libplacebo
from their upstream tags as DLLs in MSYS2's UCRT64 environment on
`windows-latest`. Every other DLL libmpv needs comes from an MSYS2 package. The
workflow asserts the LGPL configuration from the configured builds themselves
(`CONFIG_GPL 0`, `CONFIG_VERSION3 0` and `CONFIG_NONFREE 0` in FFmpeg's
`config.h`, mpv's `gpl` option `false`) and publishes the result as a
never-overwritten prerelease:

- **Release:** [`libmpv-windows-v0.41.0-b4`](https://github.com/lpbborges/grid/releases/tag/libmpv-windows-v0.41.0-b4),
  asset `libmpv-windows-x86_64.tar.gz`, with its corresponding source in
  `libmpv-windows-source.tar.xz`
- **Built by:** [workflow run 4](https://github.com/lpbborges/grid/actions/runs/36083746815),
  from commit `9d9a91fd36d64de2d7bfc8d28c81ddc0284e0fd6`
- **SHA256:** `c0e0c8dd9aa232c270614785f088dc7371434cfc3762912fcbc2c83fc0bb7d2d`
  (source archive: `162ab04fa08de2ecd6e212f95857ac4b58b80617296e2b2048f2b28b1a360ed7`)
- **Licence:** LGPL-2.1-or-later. The archive holds 31 DLLs: the 8 built here
  (`libmpv-2.dll`, `avcodec-61.dll`, `avformat-61.dll`, `avutil-59.dll`,
  `avfilter-10.dll`, `swresample-5.dll`, `swscale-8.dll`, `libplacebo-351.dll`)
  and the 23 MSYS2 DLLs below. `libplacebo-351.dll` also contains fast_float
  (MIT) and Vulkan-Headers (Apache-2.0 OR MIT). Every notice is in `LICENSES/`.
- **Build `b3`:** [`libmpv-windows-v0.41.0-b3`](https://github.com/lpbborges/grid/releases/tag/libmpv-windows-v0.41.0-b3)
  exists but was never pinned.

**Hardware decoding:** `d3d11va`, through `gpu-api=d3d11` and
`hwdec=auto-safe`. The build fails unless mpv's enabled features include
`d3d11`, `d3d-hwaccel`, `libass`, `libplacebo`, `shaderc` and `spirv-cross`,
and never includes `gpl`, `lua`, `javascript` or `libavdevice`.

The archive's `BUILD-INFO.txt` (also the release notes) records the exact
upstream revisions, the flags and every MSYS2 package:

| Component  | Tag        | Commit                                     | Built with                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ---------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mpv        | `v0.41.0`  | `41f6a645068483470267271e1d09966ca3b9f413` | `meson setup --buildtype=release -Dgpl=false -Dlibmpv=true -Dcplayer=false -Dlua=disabled -Djavascript=disabled -Dlibarchive=disabled -Dlibbluray=disabled -Duchardet=disabled -Drubberband=disabled -Dlcms2=disabled -Djpeg=disabled -Dvapoursynth=disabled -Dsdl2-gamepad=disabled -Dwin32-smtc=disabled -Dvulkan=disabled -Dgl=disabled -Degl-angle=disabled -Dlibavdevice=disabled -Dd3d11=enabled -Dd3d-hwaccel=enabled -Dspirv-cross=enabled -Dshaderc=enabled` |
| FFmpeg     | `n7.1`     | `b08d7969c550a804a59511c7b83f2dd8cc0499b8` | `configure --enable-shared --disable-static --disable-programs --disable-doc --disable-debug --disable-encoders --disable-muxers --disable-avdevice --enable-libdav1d --enable-d3d11va --enable-dxva2 --disable-bzlib --disable-lzma --disable-iconv --disable-sdl2 --disable-schannel`                                                                                                                                                                               |
| libplacebo | `v7.351.0` | `3188549fba13bbdf3a5a98de2a38c2e71f04e21e` | `meson setup --buildtype=release -Dd3d11=enabled -Dvulkan=disabled -Dopengl=disabled -Dshaderc=enabled -Dglslang=disabled -Dlcms=disabled -Ddovi=disabled -Dlibdovi=disabled -Ddemos=false -Dtests=false`                                                                                                                                                                                                                                                             |

MSYS2 UCRT64 DLLs shipped beside them. The licence column is the package's
licence field as pacman records it; it covers the whole package, and the
reviewed manifest in the workflow records what applies to the DLL. The
**Source** column says whether the package's exact MSYS2 source package is in
`libmpv-windows-source.tar.xz` (the LGPL ones) or only named, with its
repo.msys2.org URL, in `BUILD-INFO.txt` (licences that ask for no source):

| DLL                           | MSYS2 package (`mingw-w64-ucrt-x86_64-…`) | Version                  | Licence field                                                 | Source   |
| ----------------------------- | ----------------------------------------- | ------------------------ | ------------------------------------------------------------- | -------- |
| `libass-9.dll`                | `libass`                                  | 0.17.5-1                 | ISC                                                           | named    |
| `libbrotlicommon.dll`         | `brotli`                                  | 1.2.0-1                  | MIT                                                           | named    |
| `libbrotlidec.dll`            | `brotli`                                  | 1.2.0-1                  | MIT                                                           | named    |
| `libbz2-1.dll`                | `bzip2`                                   | 1.0.8-4                  | custom (bzip2-1.0.6)                                          | named    |
| `libdav1d-7.dll`              | `dav1d`                                   | 1.5.4-1                  | BSD-2-Clause                                                  | named    |
| `libexpat-1.dll`              | `expat`                                   | 2.8.5-1                  | MIT                                                           | named    |
| `libfontconfig-1.dll`         | `fontconfig`                              | 2.18.3-1                 | custom (HPND-style)                                           | named    |
| `libfreetype-6.dll`           | `freetype`                                | 2.14.3-1                 | GPL-2.0-or-later OR FTL (shipped under FTL)                   | named    |
| `libfribidi-0.dll`            | `fribidi`                                 | 1.0.17-1                 | LGPL-2.1-or-later                                             | archived |
| `libgcc_s_seh-1.dll`          | `libgcc`                                  | 16.2.0-4                 | GPL-3.0-or-later WITH GCC-exception-3.1 AND GFDL-1.3-or-later | named    |
| `libglib-2.0-0.dll`           | `glib2`                                   | 2.90.0-1                 | LGPL-2.1-or-later                                             | archived |
| `libgraphite2.dll`            | `graphite2`                               | 1.3.15-1                 | LGPL-2.1-or-later                                             | archived |
| `libharfbuzz-0.dll`           | `harfbuzz`                                | 14.5.0-1                 | MIT                                                           | named    |
| `libiconv-2.dll`              | `libiconv`                                | 1.19-1                   | LGPL-2.1-or-later; documentation: GPL-3.0-or-later            | archived |
| `libintl-8.dll`               | `gettext-runtime`                         | 1.0-1                    | GPL-3.0-or-later AND LGPL-2.1-or-later (the DLL is LGPL-2.1+) | archived |
| `libpcre2-8-0.dll`            | `pcre2`                                   | 10.48-3                  | BSD-3-Clause                                                  | named    |
| `libpng16-16.dll`             | `libpng`                                  | 1.6.58-1                 | custom (libpng-2.0)                                           | named    |
| `libshaderc_shared.dll`       | `shaderc`                                 | 2026.3-1                 | Apache-2.0                                                    | named    |
| `libspirv-cross-c-shared.dll` | `spirv-cross`                             | 1~1.4.357.0-1            | Apache-2.0                                                    | named    |
| `libstdc++-6.dll`             | `libstdc++`                               | 16.2.0-4                 | GPL-3.0-or-later WITH GCC-exception-3.1 AND GFDL-1.3-or-later | named    |
| `libunibreak-7.dll`           | `libunibreak`                             | 7.0-1                    | Zlib                                                          | named    |
| `libwinpthread-1.dll`         | `libwinpthread`                           | 14.0.0.r420.g61d40c4c0-1 | MIT AND BSD-3-Clause-Clear                                    | named    |
| `zlib1.dll`                   | `zlib`                                    | 1.3.2-2                  | Zlib                                                          | named    |

GCC's runtime DLLs ship under the GCC Runtime Library Exception; GFDL covers
GCC's manuals, which are not shipped.

**Compiled statically into the DLLs.** MinGW-w64 links some code into every
DLL, ours and MSYS2's, and `libshaderc_shared.dll` carries its dependencies
inside it (its static parts were built by MSYS2's GCC 16.1.0, Rev5):

| MSYS2 package (`mingw-w64-ucrt-x86_64-…`) | Version                  | Licence field                                                                          | Compiled into                                                           | Source   |
| ----------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| `crt`                                     | 14.0.0.r420.g61d40c4c0-1 | ZPL-2.1                                                                                | every DLL (startup objects, `libmingwex`, `libmingw32`)                 | named    |
| `headers`                                 | 14.0.0.r420.g61d40c4c0-1 | ZPL-2.1 AND LGPL-2.1-or-later                                                          | every DLL (inline code from the Windows headers, some from Wine)        | archived |
| `gcc`                                     | 16.2.0-4                 | GPL-3.0-or-later WITH GCC-exception-3.1 AND GFDL-1.3-or-later                          | every DLL (static `libgcc` parts); libstdc++ in `libshaderc_shared.dll` | named    |
| `winpthreads`                             | 14.0.0.r420.g61d40c4c0-1 | MIT AND BSD-3-Clause-Clear                                                             | `libshaderc_shared.dll`                                                 | named    |
| `glslang`                                 | 16.3.0-1                 | BSD-3-Clause (plus Apache-2.0/MIT parts and its GPL-3.0 Bison parser, Bison exception) | `libshaderc_shared.dll`                                                 | named    |
| `spirv-tools`                             | 3~1.4.357.0-1            | Apache-2.0                                                                             | `libshaderc_shared.dll`                                                 | named    |
| `spirv-headers`                           | 2~1.4.357.0-1            | MIT                                                                                    | `libshaderc_shared.dll`                                                 | named    |

The build's toolchain was MSYS2's `gcc` 16.2.0-4, `crt` and `headers`
14.0.0.r420.g61d40c4c0-1 and `binutils` 2.47-3.

**The licence gate.** The workflow walks the import tables from
`libmpv-2.dll` to find every DLL it needs, and checks each MSYS2 DLL against a
manifest reviewed by hand: one line per DLL that may ship, with its package,
the licence field exactly as pacman records it, whether its source ships, and
why it may ship (the static parts have a manifest of their own). The build
fails on a DLL the manifest does not list, a DLL that now comes from another
package, a licence field that changed, or an LGPL line that does not ship its
source. Nothing parses licence strings: a new dependency or a relicensed
package stops the build until someone reads its licence files and edits the
manifest. DLLs loaded only at run time (`LoadLibrary`) are invisible to the
walk. CI's `e2e (windows-latest)` job loads this DLL set and decodes through it
with `vo=null ao=null`. The D3D11 renderer (libplacebo, with shaderc at run
time), d3d11va hardware decoding and WASAPI audio output, where run-time-loaded
system DLLs such as `dxgi`, `d3d11` and `d3dcompiler_47` come in, are covered
only by the clean-machine check before the first Windows release.

**FreeType:** Portions of this software are copyright © 2026 The FreeType
Project (www.freetype.org). All rights reserved.

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

For Windows it is `libmpv-windows-source.tar.xz` in the same release as the
pinned binaries: the exact source trees of mpv, FFmpeg and libplacebo (with its
submodules), taken before anything was built, the workflow that built them,
and the exact MSYS2 source packages (under `msys2/`) of every LGPL part:
fribidi, glib2, graphite2, libiconv, gettext (`libintl-8.dll`) and the
MinGW-w64 `headers`. The other MSYS2 packages are under licences that ask only
for their notice, which ships in `LICENSES/`; `BUILD-INFO.txt` names each one's
exact source package on `repo.msys2.org/mingw/sources/`. Once Windows releases
return, `release.yml` will link this archive the same way.

**Retention.** Never delete or edit a `libmpv-*` prerelease that any published
Grid release has pinned. It is where that release's LGPL source is offered.
Only an unpinned build may be deleted, and only after
`git show <tag>:scripts/libmpv.lock.json` for each Grid release tag shows that
none of them pinned it.

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
- **Windows (MSI, NSIS):** `libmpv-2.dll` and every DLL it loads (FFmpeg,
  libplacebo and the MSYS2 DLLs above) sit beside `grid.exe` in the install
  directory. Windows loads DLLs from the executable's directory first, so each
  one can be swapped individually.

A replacement must provide the same libmpv client API under the same file name
(`libmpv.so.2` on Linux, `libmpv-2.dll` on Windows).

## Licence texts shipped with each package

- **Linux (`.deb`, `.rpm`, AppImage):** `usr/lib/grid/LICENSES/`, copied from
  the Linux artifact: `mpv-LGPL-2.1.txt`, `ffmpeg-LGPL-2.1.txt`,
  `libplacebo-LGPL-2.1.txt`, `dav1d-BSD-2.txt`, `libdisplay-info-MIT.txt`,
  `glslang-copyright.txt`, `glslang-LICENSE.txt` (with the Bison exception),
  `Apache-2.0.txt`, `spirv-tools-copyright.txt`,
  `spirv-headers-copyright.txt`, `fast_float-MIT.txt`,
  `glad-MIT-and-Khronos.txt` and the three `Vulkan-Headers-*` files. CI's
  `package-linux` job fails if any is missing from a package.
- **Windows (MSI, NSIS):** `LICENSES\` beside `grid.exe`, copied from the
  Windows artifact: `mpv-LGPL-2.1.txt`, `ffmpeg-LGPL-2.1.txt`,
  `libplacebo-LGPL-2.1.txt`, `fast_float-MIT.txt`, the three
  `Vulkan-Headers-*` files, and one folder per MSYS2 package, shipped or
  compiled in, with the licence files it installs (54 files in `b4`). CI's
  `package-windows` job fails if any DLL or licence file in the artifact is
  missing from either installer (`scripts/windows-layout-required.ps1`).

Nothing here is legal advice. The obligations above were checked against the
licence texts, not reviewed by a lawyer.
