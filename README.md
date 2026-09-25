# Grid

Grid is a native desktop application built with **Tauri**, **SvelteKit**, **TypeScript**, and **Rust**. It lets you browse popular movies and TV series via Cinemeta and stream them directly using a built-in streaming engine (`rqbit`).

## Features

- **Cinemeta & YTS Integration:** Browse popular movies and TV series with high-quality fallback metadata.
- **Instant Search:** Live catalog search across the full Cinemeta library — movies and series found by title as you type, with debounced API queries.
- **Metadata Translation:** Movie and series titles, synopses, and episode names from Cinemeta are translated on the fly into the system language reported by the webview, and cached locally. Only this metadata is translated: the app interface itself is in Brazilian Portuguese (pt-BR). See [Data sources & privacy](#data-sources--privacy).
- **Cinematic UI:** Fully-opaque movie/series poster backgrounds with Stremio-style gradients.
- **Streaming Engine Integration:** Seamless streaming powered by the `rqbit` sidecar for both Movies and TV Series (via Torrentio).
- **Video Cache:** Downloaded videos are kept in a persistent cache under the app data directory (`downloads/`, tracked by `downloads/manifest.json`) so rewatching doesn't download again. The cache is capped at 3 GB by default; when a new video needs space, the least recently watched entries are evicted. Videos larger than the cap stream normally and are deleted when playback ends.
- **Watch Progress:** Playback position is remembered per movie and per episode, and home-screen cards show a progress bar (for series, the most recently watched episode).
- **TV Series Playback:** Full support for season/episode selection and dynamic metadata/subtitle loading.
- **Global Playback Preferences:** Audio, Subtitle, and Quality preferences set once and remembered across the app (persisted locally). Grid ranks and picks the best matching source from YTS + Torrentio behind the scenes and silently enables the right embedded audio/subtitle track when playback starts, resolving the movie/show's real original language instead of guessing.
- **Frameless Design:** Desktop window with custom controls and a draggable header.
- **Cyberpunk Theme:** A unique visual identity built with Tailwind CSS v4 featuring neon glows, digital grid backgrounds, and cyberpunk typography (Orbitron/Rajdhani, bundled locally).
- **Advanced Media Player:** Dedicated full-screen cinematic player overlay featuring real-time download progress tracking, custom Svelte 5 video controls, multi-track audio selection, on-the-fly SRT-to-VTT subtitle conversion, and grouped menus for both Embedded and Extra (downloaded) subtitles. The same Svelte UI and playback orchestration (`usePlayer`) drives both backends: a `<video>` element on macOS, and libmpv running inside Grid on Linux and Windows, drawing beneath the same Svelte controls. On Linux, libmpv is the default, so the subtitle and audio tracks embedded in the file show up in the menus there too (the `<video>` element in WebKitGTK loses them).
- **Test-Driven:** Vitest and Svelte Testing Library tests for the frontend, plus Rust unit tests for the backend. Run `npm run test:frontend:cov` for the current coverage report.
- **Robust Error Handling:** Resilient polling for engine startup, a specific error when the engine cannot start, dynamic port allocation to prevent address conflicts, and timeouts on external API calls; starting playback automatically retries with a fresh request when a source stops responding. Metadata translation tries Google Translate first and MyMemory as a backup; if both fail, the original English text is shown.

## Prerequisites

- [Node.js](https://nodejs.org/) 24 and npm (the version CI uses).
- A stable [Rust toolchain](https://rustup.rs/).
- The Tauri system dependencies for your OS, listed in the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/). On Debian/Ubuntu:

  ```sh
  sudo apt-get install -y build-essential curl wget file libxdo-dev libssl-dev \
    libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
  ```

- The libmpv development files, for native playback. Linux: `sudo apt install libmpv-dev` (Debian/Ubuntu) or the `mpv` package (Arch, which ships the headers alongside the player); Linux development needs libmpv from mpv 0.33 or newer. Windows: the MSVC build tools (`dumpbin` and `lib`), then run `npm run setup:libmpv` once to fetch the pinned DLLs and generate libmpv's import library; it unpacks the archive with the `tar.exe` built into Windows 10 1803 and later. macOS needs nothing here: it plays through the `<video>` element and never links libmpv.

- Linux playback, in `tauri dev` and in release builds, goes through libmpv and needs no GStreamer plugins. Only the `<video>` element does: set `VITE_GRID_NATIVE_PLAYER=off` (for example `VITE_GRID_NATIVE_PLAYER=off npm run tauri dev`) to force it for comparison, and the E2E build forces it too. It then decodes through GStreamer in WebKitGTK, whose decoders are not installed by default on a clean Ubuntu or Fedora; without them 4K HEVC and E-AC3 releases fail with "este vídeo precisa de componentes de vídeo que não estão instalados no sistema". Release packages do not declare them as dependencies, so install them yourself when you need that path (Debian/Ubuntu):

  ```sh
  sudo apt-get install -y gstreamer1.0-libav gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad
  ```

- For the end-to-end playback tests (Linux and Windows only): [`tauri-driver`](https://v2.tauri.app/develop/tests/webdriver/) (`cargo install tauri-driver --locked`), plus `WebKitWebDriver` and the GStreamer libav plugins on Linux (Debian/Ubuntu: `sudo apt-get install -y webkit2gtk-driver gstreamer1.0-libav`), or an `msedgedriver` matching your WebView2 version on Windows (point `NATIVE_DRIVER` at it). `ffmpeg` is needed only to regenerate the test media.

- **Linux release builds** bundle their own LGPL libmpv (`npm run setup:libmpv -- --bundle`, see [libmpv](#libmpv-linux-and-windows)) and require **glibc 2.39 or newer** (Ubuntu 24.04+, Debian 13+, Fedora 40+): the Grid binary itself needs it. Older distributions are not supported.

## Getting Started

```sh
npm install
npm run tauri dev
```

The first `tauri dev` compiles the Rust backend, which takes a few minutes. To produce installable bundles for your platform:

```sh
npm run tauri build
```

Bundles are written to `src-tauri/target/release/bundle/`. On Windows, run `npm run setup:libmpv` first; the installers ship `libmpv-2.dll`, every DLL it loads and their `LICENSES\` folder beside `grid.exe`. On Linux, use `npm run setup:libmpv -- --bundle && npm run bundle:linux` instead — it fetches the bundled LGPL libmpv, then builds the `.deb`, `.rpm` and AppImage with the environment linuxdeploy needs to find and package it (see [libmpv](#libmpv-linux-and-windows)); `npm run tauri build` alone does not set that up.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).

## Scripts

- `npm run dev` - Start the frontend dev server only. Browsing and search work in a plain browser, but playback, subtitles, and the video cache need the Tauri backend, so use `npm run tauri dev` for those.
- `npm run tauri dev` - Start the Tauri window and dev server.
- `npm run tauri build` - Build release bundles.
- `npm run bundle:linux` - Linux only: build the `.deb`, `.rpm` and AppImage with the bundled libmpv (run `npm run setup:libmpv -- --bundle` first).
- `npm run test:frontend` - Run the frontend test suite.
- `npm run test:frontend:cov` - Run the frontend tests with a coverage report.
- `npm run test:backend` - Run the Rust unit tests.
- `npm run test:backend:cov` - Run the Rust tests with a coverage report (requires [`cargo-llvm-cov`](https://github.com/taiki-e/cargo-llvm-cov)).
- `npm run test:e2e` - Build the app against local mock services and play fixture movies and episodes in the real window (Linux/Windows).
- `npm run test:e2e:run` - Run the E2E specs against the last `build:e2e` without rebuilding.
- `npm run build:e2e` - Build the debug app used by the E2E specs.
- `npm run test:e2e:native` - Build with the native player enabled and exercise it (Linux and Windows). `npm run test:e2e:native:run` reruns the specs without rebuilding.
- `npm run build:e2e:native` - Build the debug app with the native player enabled, without running the specs.
- `npm run test:e2e:render:run` - Linux only: plays the fixture through libmpv under Xvfb and checks the video is drawn beneath the webview (needs `npm run build:e2e:native` and ImageMagick).
- `npm run test:e2e:live` - Manual smoke test that plays a public-domain title through the real services. Needs internet access; never required to pass.
- `npm run check:e2e` - Type-check the `e2e/` folder.
- `npm run e2e:services` - Start the E2E mock services and fixture seeders on their own, for debugging.
- `npm run check` - Verify TypeScript typings.
- `npm run check:watch` - Verify TypeScript typings in watch mode.
- `npm run lint` - Lint the codebase using ESLint.
- `npm run format` - Format the codebase using Prettier.
- `npm run setup:libmpv` - Download the pinned LGPL libmpv (Windows; pass `--bundle` for Linux release packaging).

## Testing Playback

Playback is protected by three layers of tests that share the fixture videos in `tests/fixtures/media/` (short MP4 and MKV clips with embedded subtitle tracks):

1. **Wiring tests** (`src/routes/*/[id]/*-playback.test.ts`, part of `npm run test:frontend`): render the real movie and series pages, player composable, orchestrator and engine client, faking only Tauri IPC and HTTP. They catch changes that disconnect the pieces.
2. **Engine tests** (`src-tauri/src/playback_engine_tests.rs`, part of `npm run test:backend`): start the real rqbit sidecar, a local seeder and a fake tracker with no internet access, and stream the fixtures through the real stream proxy. They catch rqbit upgrades, proxy and header-patching bugs.
3. **End-to-end tests** (`e2e/`, `npm run test:e2e`, CI job `e2e` on Linux and Windows): run the built app against local mock services and check that the video actually advances, including after a seek; the offline swarm includes a source that ignores its first connection so the add-retry path is exercised on every run.

The rqbit HTTP responses the wiring tests fake are recorded in `tests/fixtures/rqbit/`. After updating the sidecar, refresh them and fix `src/lib/engine/__fixtures__/fakeRqbit.ts` if the shapes changed:

```sh
cd src-tauri && UPDATE_RQBIT_SNAPSHOTS=1 cargo test playback_engine_tests
```

To regenerate the fixture videos: `scripts/fixtures/generate-media.sh` (requires `ffmpeg`).

### Manual playback checklist

Run this on macOS (not covered by the end-to-end tests) and before each release:

1. Open a movie from the home screen, press **Reproduzir**, and confirm the video starts.
2. Seek forward and backward; playback continues.
3. Pick a subtitle and an audio track from the player menus.
4. Close the player and press **Reproduzir** again; playback resumes where it stopped.
5. Open a series and play episodes from two different seasons.
6. Quit the app while a video is playing, reopen it, and play again.

## Architecture

```
SvelteKit UI (static build, runs in the Tauri webview)
  ├─ fetch ──────────► Cinemeta / YTS mirror / Torrentio / translation APIs
  ├─ invoke ─────────► Rust commands (src-tauri/src/lib.rs)
  │                      ├─ start_torrent_engine   spawns the rqbit sidecar on a free 127.0.0.1 port
  │                      ├─ get_stream_proxy_url    returns the local stream proxy address
  │                      ├─ fetch_*_subtitle        fetches subtitles, converts SRT to VTT
  │                      ├─ get_cache_manifest / upsert_cache_entry / evict_for_space
  │                      └─ start_native_player / native_player_set_tracks /
  │                         stop_native_player    (Linux/Windows: drives libmpv)
  ├─ fetch ──────────► rqbit HTTP API on 127.0.0.1 (add, stats)
  └─ usePlayer() ────► PlayerBackend
                         ├─ useDomBackend ──► stream proxy on 127.0.0.1  (macOS, or forced off)
                         └─ useMpvBackend ──► libmpv (in-process)        (Linux/Windows)
```

- **Stream proxy:** WebKitGTK does not start MP4 or Matroska files that carry embedded subtitle tracks while the rest of the file is still downloading, so the `<video>` element streams through a small proxy in `src-tauri/src/stream_proxy.rs`. It forwards range requests to rqbit and hides every embedded subtitle track in the file header without changing its size (a `Void` element in Matroska, a `free` atom in MP4; see `src-tauri/src/media_patch/`), leaving every byte offset intact. Subtitles are still shown from separate `.srt`/`.vtt` files.

  The patch exists only for WebKitGTK. Anything that demuxes Matroska correctly would see an empty subtitle menu instead, so the proxy also serves an unpatched variant at `?raw=1`, which is what the libmpv path asks for.

- **Decoding:** Linux and Windows play through libmpv inside Grid's own window, with the same Svelte controls on top (see [Player](#player-linux-and-windows)): WebView2 decodes neither HEVC nor E-AC3 and cannot demux Matroska, and WebKitGTK's `<video>` element needs extra GStreamer plugins and loses the embedded subtitle and audio tracks. macOS plays in a `<video>` element. `VITE_GRID_NATIVE_PLAYER=off` forces the `<video>` element on Linux and Windows (the E2E build does this; `on` forces libmpv).

- `src/lib/api/` wraps external services, `src/lib/engine/` drives playback (engine, cache, ranking), `src/lib/composables/` and `src/lib/stores/` hold reactive state, and `src/lib/components/` holds the UI.
- **Where state lives:**
  - `localStorage`: playback preferences (`grid-audio`, `grid-subtitle`, `grid-quality`, `grid-cache-limit-bytes`), watch progress (`grid-progress`) and watched titles (`grid-watched`).
  - IndexedDB `grid-translations`: the metadata translation cache.
  - App data directory: the video cache (`downloads/` and `downloads/manifest.json`).
  - App cache directory: `grid-engine.pid`, used to clean up an engine left behind by a crash. On Linux and Windows the engine also stops by itself when the app is killed (`src-tauri/src/engine_process.rs`).

## Sidecars

Grid ships one sidecar binary, the streaming engine. It is declared as a [Tauri sidecar](https://v2.tauri.app/develop/sidecar/) under `bundle.externalBin`, and Tauri expects one binary per target, named `<name>-<target-triple>`. The player is a library linked into Grid, not a sidecar; it is described here because it ships alongside it (see [libmpv](#libmpv-linux-and-windows)).

### Streaming engine (all platforms)

The engine is [rqbit](https://github.com/ikatson/rqbit) 9.0.1, declared in `src-tauri/tauri.conf.json`:

| File in `src-tauri/bin/`           | Platform                                    |
| ---------------------------------- | ------------------------------------------- |
| `rqbit-x86_64-unknown-linux-gnu`   | Linux x86-64                                |
| `rqbit-x86_64-pc-windows-msvc.exe` | Windows x86-64                              |
| `rqbit-x86_64-apple-darwin`        | macOS (universal binary)                    |
| `rqbit-aarch64-apple-darwin`       | macOS (the same universal binary, 2nd name) |

To update it:

1. Download the new release for each platform from the [rqbit releases page](https://github.com/ikatson/rqbit/releases).
2. Rename each binary to `rqbit-<target-triple>` (`rustc --print host-tuple` prints the triple of your machine) and replace the file in `src-tauri/bin/`. On Linux/macOS, make sure it is executable (`chmod +x`).
3. Run `src-tauri/bin/rqbit-<your-triple> --version`, then `npm run tauri dev` and play something to confirm the HTTP API is still compatible.

### Player (Linux and Windows)

WebView2 cannot decode the codecs releases actually ship (HEVC, AC3/E-AC3) and
cannot demux Matroska over range requests, so native playback runs through
[libmpv](https://mpv.io/) **in-process** (`src-tauri/src/player/`): one instance
per app run, created on the first playback, with Grid's own Svelte controls on
top. The commands are the only way in; there is no generic mpv passthrough.

- **Linux:** libmpv draws through its render API into a `GtkGLArea` placed under
  the transparent WebKitGTK webview, so GTK composites the controls over the video
  in-process, which works on Wayland as well as X11. Development builds link the
  system libmpv (see [Prerequisites](#prerequisites)).
- **Windows:** libmpv is given Grid's window handle (`wid`) and creates its own
  child window, which `window_embed.rs` pushes beneath WebView2. Run
  `npm run setup:libmpv` once to fetch Grid's pinned LGPL `libmpv-2.dll` and
  the DLLs it loads.

### libmpv (Linux and Windows)

libmpv is a library **linked into Grid's own process**, not a sidecar. Both
platforms use a pinned **LGPL** build, recorded by URL and SHA256 in
`scripts/libmpv.lock.json`; `npm run setup:libmpv` downloads and verifies it.

- **Linux** development links the system libmpv. Release packages use Grid's
  own build (`.github/workflows/build-libmpv-linux.yml`), published as a
  never-overwritten prerelease in Grid's repository together with its complete
  source (`libmpv-linux-source.tar.xz`):
  `npm run setup:libmpv -- --bundle` downloads it into two directories —
  `src-tauri/lib/linux/` (the full archive, symlinks included, used only to link
  the Rust binary at build time) and `src-tauri/lib/linux-runtime/` (one real
  file per SONAME plus `LICENSES/`, pruned so the package doesn't ship the same
  bytes three times over). `npm run bundle:linux` installs `lib/linux-runtime`
  to `/usr/lib/grid` in the `.deb` and `.rpm` per
  `src-tauri/tauri.linux.conf.json`; the binary's RUNPATH
  (`$ORIGIN/../lib/grid`, `$ORIGIN/../lib`) finds it there ahead of any system
  libmpv. The AppImage ships only `LICENSES/` under `usr/lib/grid`: linuxdeploy
  already resolves and copies every library the binary needs (including the
  bundled libmpv) into its own `usr/lib` and rewrites RUNPATH to point there, so
  a second copy under `usr/lib/grid` would just be dead weight. Requires glibc
  2.39 (Ubuntu 24.04+, Debian 13+, Fedora 40+; see [Prerequisites](#prerequisites)).
- **Windows** development, CI and the installers use Grid's own build
  (`.github/workflows/build-libmpv-windows.yml`): `libmpv-2.dll`, FFmpeg and
  libplacebo built from pinned tags, plus the MSYS2 DLLs they need, published
  as a never-overwritten prerelease together with their LGPL source
  (`libmpv-windows-source.tar.xz`). `npm run setup:libmpv` puts every DLL, their
  `LICENSES/` and a generated `mpv.lib` import library in
  `src-tauri/lib/windows/`, and `src-tauri/tauri.windows.conf.json` bundles each
  `lib/windows/*.dll` and `LICENSES/` beside `grid.exe`.

See [`src-tauri/licenses/README.md`](src-tauri/licenses/README.md) for the
licensing route, the source offer and how to replace the library.

## Data Sources & Privacy

Grid talks to these services directly from your machine. Every host must also be allowed in the CSP in `src-tauri/tauri.conf.json`.

- **Cinemeta** (`v3-cinemeta.strem.io`): catalog, search, and movie/series metadata.
- **YTS mirror** (`movies-api.accel.li`): extra movie details.
- **Torrentio** (`torrentio.strem.fun`): stream sources for movies and episodes.
- **OpenSubtitles via strem.io** (`opensubtitles-v3.strem.io`, `*.strem.io`): external subtitles.
- **Google Translate** (unofficial `translate.googleapis.com` endpoint) and **MyMemory** (`api.mymemory.translated.net`): metadata translation.

**Translation privacy:** when the system language is not English, the title, synopsis, and episode names of the titles you open are sent in plain text to Google Translate (and to MyMemory if Google fails). No account data or playback history is sent. There is currently no setting to turn translation off.

## Troubleshooting

- **"Não foi possível iniciar o player"**: the engine could not start. Check that the sidecar for your platform exists in `src-tauri/bin/` and is executable, and read the `tauri dev` terminal output for `Sidecar spawn error`.
- **`Port 1420 is already in use`**: the dev server needs port 1420 (`strictPort`). Stop the other process using it. The engine itself always picks free ports.
- **A stale engine keeps running after a crash**: on Linux and Windows the engine stops together with the app, even when the app is force-quit. On macOS, and if that fails, the next start kills it using `grid-engine.pid` in the app cache directory, but only if the process still looks like `rqbit`. If one survives, end the `rqbit` process manually and delete the PID file.
- **Clearing the video cache**: quit the app and delete the `downloads/` folder in the app data directory:
  - Linux: `~/.local/share/com.lp01.grid/`
  - macOS: `~/Library/Application Support/com.lp01.grid/`
  - Windows: `%APPDATA%\com.lp01.grid\`
- **E2E specs never start playback**: read the logs in `e2e/artifacts/` (uploaded by CI on failure): `engine.log` is the app's streaming engine (every app launch, on Linux and Windows), `seeder-<fixture>.log` are the local fixture seeders, and `app-and-driver.log` is the WebDriver output. An empty `engine.log` means the sidecar did not start. A `MediaError 4` means GStreamer lacks H.264/AAC decoders (install the libav plugins). Run `npm run e2e:services` to check the mock services and seeders on their own.

## Disclaimer

Grid does not host, index, or distribute any content. It only plays streams that third-party services return, using a peer-to-peer engine that uploads data while downloading. You are responsible for making sure that what you watch is legal where you live.

## License

[MIT](LICENSE) © 2026 LP

The Linux and Windows builds link libmpv (and the FFmpeg it uses) in-process. The Linux release packages and the Windows installers bundle an LGPL-2.1-or-later build of it together with its licence texts and a link to its complete source — see [`src-tauri/licenses/`](src-tauri/licenses/) for the licensing route, the source offer and how to replace the library.
