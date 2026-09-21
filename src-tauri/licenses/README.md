# Bundled third-party software

Grid itself is MIT licensed (see `LICENSE` at the repository root).

## Status: the mpv sidecar is not shipped yet

`src-tauri/bin/mpv-*` is gitignored on purpose. A local copy is fine for
development, but no mpv binary is committed or distributed while this is open.

**The decision: ship an LGPL build, not a GPL one.**

### Why

Grid runs mpv as a separate process over JSON IPC and never links
`libmpv-2.dll`, so Grid's own code stays MIT either way — that was never the
risk. The risk is the _distribution_ obligation: GPLv2 section 3 requires anyone
shipping the binary to also ship its corresponding source, or a written offer
valid for three years. That is a permanent, per-release burden.

An LGPL build removes it. What GPL buys in an mpv build is:

- **Encoders** — `libx264`, `libx265`, `libxvid`. Grid decodes; it never encodes.
- **GPL-only filters** — the `pp`/`spp`/`uspp` postprocessing family, `delogo`,
  `owdenoise`. Grid applies none of them, and launches mpv with `--no-config`
  so a user's own filter settings cannot reach it either.
- **GPL-only mpv subsystems** — X11 video output, OSS audio, NVIDIA vdpau. All
  Linux-only; the Windows player uses `--gpu-api=d3d11` and WASAPI.

Nothing in the decode path is GPL. H.264, HEVC, VP9, AV1, AC3, E-AC3, DTS and
AAC decoding is FFmpeg's own LGPL code, `d3d11va` hardware decoding is core, and
libass (subtitle rendering) is ISC. Confirmed against the bundled build: `--vd=help`
lists `h264` and `hevc` as decoders, while `libx264`/`libx265` appear only under
`--ovc`, the encoder list.

- mpv is GPLv2+ by default and LGPLv2.1+ when built with `-Dgpl=false`
  (mpv's `Copyright` file).
- FFmpeg is LGPLv2.1+ by default and only becomes GPL via `--enable-gpl`
  (https://www.ffmpeg.org/legal.html).

### What this needs

**No prebuilt LGPL `mpv.exe` exists.** The `lgpl` artifacts published by the
community winbuild repos are FFmpeg libraries and `mpv-dev-lgpl` (the libmpv
DLL) — the player executable ships GPL-only. So the binary has to be built:

`.github/workflows/build-mpv-lgpl.yml` does this. It is a manual
(`workflow_dispatch`) job that clones `shinchiro/mpv-winbuild-cmake` at a pinned
revision, patches the build definitions, builds, and uploads the sidecar.

Upstream has no LGPL switch, so the job edits the build definitions:

| File           | Change                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ffmpeg.cmake` | drop `--enable-gpl`, `libx264`, `libx265`, `libdvdnav`, `libdvdread`, `librubberband`, `libzvbi`, `davs2`, and their dependency entries |
| `ffmpeg.cmake` | drop `--enable-openssl`, `libssh`, `libsrt` and `--enable-version3` (see below)                                                         |
| `mpv.cmake`    | add `-Dgpl=false`; drop `dvdnav` and `rubberband`                                                                                       |

OpenSSL is Apache-2.0, whose patent clause is incompatible with LGPLv2.1 — that
is exactly what upstream's `--enable-version3` is there to resolve. `libssh` and
`libsrt` link it. Grid only ever streams plain HTTP from its own 127.0.0.1 proxy,
so dropping all three lets the build target LGPLv2.1 rather than LGPLv3, and
makes the binary smaller.

Every removal asserts that the flag is present first, so an upstream rename fails
the job loudly instead of quietly producing a GPL binary. After the build, a
licence gate reads FFmpeg's generated `config.h` and fails unless `CONFIG_GPL 0`
holds, no GPL component is enabled, and the decoders Grid needs (H.264, HEVC,
AC3, E-AC3, AAC, Matroska, D3D11VA) all survived.

**The workflow has never completed a run.** The patch steps were dry-run against
the current upstream files and produce a clean result, but the build itself takes
hours and must succeed once before the artifact can be trusted. Treat the first
run as the real authoring step, then record the version and revision here.

### Caveat on third-party LGPL claims

The community LGPL builds carry an explicit disclaimer that their authors are not
lawyers and cannot guarantee every LGPL-incompatible component was disabled, and
at least some statically link FFmpeg under LGPLv3 — static linking carries its own
relinking obligation. Building it yourself, from a dependency set you control, is
the point.

## Licence texts

- `COPYING.GPLv2.txt` — GNU General Public License v2, kept for reference while
  the local development binary is still the GPL build. Replace with the LGPL text
  when the LGPL binary lands.

## If this decision is ever reversed

Bundling the GPL build means satisfying GPLv2 section 3 on every release:
publishing the exact mpv, FFmpeg and build-script sources at their pinned
revisions, or including a written offer with a contact address valid for three
years. Linking to upstream is not sufficient — the offer must come from the
distributor. That needs review by someone qualified; nothing here is legal advice.
