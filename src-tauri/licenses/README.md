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
Dynamically linking an LGPL one keeps Grid's own code MIT, provided users can
swap in their own build of the library.

### The rule

- **Grid must only ever ship an LGPL-2.1-or-later libmpv build.** Never a GPL
  build, on any platform.
- **Development may link the system libmpv.** On Linux that is the
  distribution's package (`libmpv-dev`, or Arch's `mpv`), which is usually a GPL
  build. That is fine for a local build nobody receives; it is not fine for a
  release.
- **No mpv code is distributed yet.** Release packaging that bundles libmpv is
  PR 2 of the libmpv plan; until it lands, `.github/workflows/release.yml` fails
  on purpose before building anything.

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
AAC decoding is FFmpeg's own LGPL code, `d3d11va` hardware decoding is core, and
libass (subtitle rendering) is ISC.

### Windows: the pinned DLL

`npm run setup:libmpv` downloads a prebuilt LGPL libmpv for Windows builds,
pinned in `scripts/libmpv.lock.json` and verified by SHA256 before it is used:

- **Source:** [`zhongfly/mpv-winbuild`](https://github.com/zhongfly/mpv-winbuild),
  asset `mpv-dev-lgpl-x86_64-20260923-git-bdefd6cb42.7z`
- **Tag:** `2026-09-23-bdefd6cb42`
- **SHA256:** `f44eb9a2e3a187af66e16bd7d8be37bfa46ac0c894297145937bab9116f2aec1`
- **Licence:** LGPL-2.1-or-later

Checked when it was pinned:

- `strings libmpv-2.dll | grep -c -- '--enable-gpl'` prints `0`: FFmpeg's
  recorded configuration has no `--enable-gpl`.
- The licence notices embedded in the DLL are the LGPL 2.1 "or (at your option)
  any later version" wording throughout; no GPL notice was found.
- The archive ships no `mpv.def`, so `setup:libmpv` generates the import
  library from the DLL's export table.

**Caveat:** `zhongfly/mpv-winbuild` is a rolling nightly repository that
publishes a new build on every mpv commit. The pin keeps builds reproducible
for as long as that tag exists, but it is not a versioned release and nothing
guarantees it stays published. Whether to mirror the artifact somewhere Grid
controls is a PR 2 decision. Community LGPL builds also carry their authors'
own disclaimer that they cannot guarantee every LGPL-incompatible component was
disabled, so the checks above are evidence, not a guarantee.

`.github/workflows/build-mpv-lgpl.yml` predates the in-process player: it builds
an LGPL mpv _executable_ from `shinchiro/mpv-winbuild-cmake`, which Grid no
longer runs. Whether it is retired or turned into a libmpv build is also left to
PR 2.

### Left to PR 2

Shipping an LGPL library carries obligations that land together with the first
release that bundles it:

- ship the LGPL-2.1 licence text alongside the library in every package;
- provide the corresponding source for the exact libmpv (and FFmpeg) build
  shipped, or a written offer for it;
- bundle the library on Linux as well, so releases never depend on the
  distribution's (usually GPL) libmpv.

None of that is done here, because nothing is distributed yet.

## Licence texts

- `COPYING.GPLv2.txt` — GNU General Public License v2, left over from an
  earlier prototype. Grid distributes no GPL code. PR 2 replaces it with the
  LGPL-2.1 text that ships with the bundled library.

Nothing here is legal advice; the distribution obligations above need review by
someone qualified before the first release that bundles libmpv.
