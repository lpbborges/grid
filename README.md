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
- **Advanced Media Player:** Dedicated full-screen cinematic player overlay featuring real-time download progress tracking, custom Svelte 5 video controls, multi-track audio selection, on-the-fly SRT-to-VTT subtitle conversion, and grouped menus for both Embedded and Extra (downloaded) subtitles. The same Svelte UI and playback orchestration (`usePlayer`) drives both backends: a `<video>` element on Linux and macOS, and the mpv sidecar rendering inside Grid's own window on Windows, where the webview cannot decode what releases actually ship.
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

- The libmpv development files, for native playback. Linux: `sudo apt install libmpv-dev` (Debian/Ubuntu) or the `mpv` package (Arch, which ships the headers alongside the player). Windows: 7-Zip and the MSVC build tools, then run `npm run setup:libmpv` once to fetch the pinned DLL and generate its import library. macOS needs nothing here: it plays through the `<video>` element and never links libmpv.

- On Linux, the GStreamer decoders the webview plays through. They are not installed by default on a clean Ubuntu or Fedora, and without them 4K HEVC and E-AC3 releases fail with "este vídeo precisa de componentes de vídeo que não estão instalados no sistema". The `.deb` declares them; for `tauri dev` or another package format, install them yourself (Debian/Ubuntu):

  ```sh
  sudo apt-get install -y gstreamer1.0-libav gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad
  ```

- For the end-to-end playback tests (Linux and Windows only): [`tauri-driver`](https://v2.tauri.app/develop/tests/webdriver/) (`cargo install tauri-driver --locked`), plus `WebKitWebDriver` and the GStreamer libav plugins on Linux (Debian/Ubuntu: `sudo apt-get install -y webkit2gtk-driver gstreamer1.0-libav`), or an `msedgedriver` matching your WebView2 version on Windows (point `NATIVE_DRIVER` at it). `ffmpeg` is needed only to regenerate the test media.

## Getting Started

```sh
npm install
npm run tauri dev
```

The first `tauri dev` compiles the Rust backend, which takes a few minutes. To produce installable bundles for your platform:

```sh
npm run tauri build
```

Bundles are written to `src-tauri/target/release/bundle/`.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).

## Scripts

- `npm run dev` - Start the frontend dev server only. Browsing and search work in a plain browser, but playback, subtitles, and the video cache need the Tauri backend, so use `npm run tauri dev` for those.
- `npm run tauri dev` - Start the Tauri window and dev server.
- `npm run tauri build` - Build release bundles.
- `npm run test:frontend` - Run the frontend test suite.
- `npm run test:frontend:cov` - Run the frontend tests with a coverage report.
- `npm run test:backend` - Run the Rust unit tests.
- `npm run test:backend:cov` - Run the Rust tests with a coverage report (requires [`cargo-llvm-cov`](https://github.com/taiki-e/cargo-llvm-cov)).
- `npm run test:e2e` - Build the app against local mock services and play fixture movies and episodes in the real window (Linux/Windows).
- `npm run test:e2e:run` - Run the E2E specs against the last `build:e2e` without rebuilding.
- `npm run build:e2e` - Build the debug app used by the E2E specs.
- `npm run test:e2e:native` - Build with the native Windows player enabled and exercise it (Windows only). Skipped automatically when the mpv sidecar is absent; see [Sidecars](#sidecars).
- `npm run build:e2e:native` - Build the debug app with the native player enabled, without running the specs.
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
  │                         stop_native_player    (Windows: drives the mpv sidecar)
  ├─ fetch ──────────► rqbit HTTP API on 127.0.0.1 (add, stats)
  └─ usePlayer() ────► PlayerBackend
                         ├─ useDomBackend ──► stream proxy on 127.0.0.1  (Linux/macOS)
                         └─ useMpvBackend ──► mpv sidecar (IPC)          (Windows, in-window)
```

- **Stream proxy:** WebKitGTK does not start MP4 or Matroska files that carry embedded subtitle tracks while the rest of the file is still downloading, so the `<video>` element streams through a small proxy in `src-tauri/src/stream_proxy.rs`. It forwards range requests to rqbit and hides every embedded subtitle track in the file header without changing its size (a `Void` element in Matroska, a `free` atom in MP4; see `src-tauri/src/media_patch/`), leaving every byte offset intact. Subtitles are still shown from separate `.srt`/`.vtt` files.

  The patch exists only for WebKitGTK. Anything that demuxes Matroska correctly would see an empty subtitle menu instead, so the proxy also serves an unpatched variant at `?raw=1`, which is what the Windows mpv path asks for.

- **Decoding:** Linux and macOS play in a `<video>` element, which decodes through GStreamer in WebKitGTK — hence the plugin requirement above. Windows cannot: the webview decodes neither HEVC nor E-AC3 and cannot demux Matroska, so it plays through the mpv sidecar instead, reparented into Grid's own window so the same Svelte controls sit on top (see [Player](#player-windows-only)).

- `src/lib/api/` wraps external services, `src/lib/engine/` drives playback (engine, cache, ranking), `src/lib/composables/` and `src/lib/stores/` hold reactive state, and `src/lib/components/` holds the UI.
- **Where state lives:**
  - `localStorage`: playback preferences (`grid-audio`, `grid-subtitle`, `grid-quality`, `grid-cache-limit-bytes`), watch progress (`grid-progress`) and watched titles (`grid-watched`).
  - IndexedDB `grid-translations`: the metadata translation cache.
  - App data directory: the video cache (`downloads/` and `downloads/manifest.json`).
  - App cache directory: `grid-engine.pid`, used to clean up an engine left behind by a crash. On Linux and Windows the engine also stops by itself when the app is killed (`src-tauri/src/engine_process.rs`).

## Sidecars

Grid ships two sidecar binaries. Both are declared as [Tauri sidecars](https://v2.tauri.app/develop/sidecar/) under `bundle.externalBin`, and Tauri expects one binary per target, named `<name>-<target-triple>`.

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

### Player (Windows only)

WebView2 cannot decode the codecs torrent releases actually ship (HEVC, AC3/E-AC3)
and cannot demux Matroska over range requests, so Windows playback runs through
[mpv](https://mpv.io/) instead of a `<video>` element. mpv is launched with
`--wid` so it renders **inside** Grid's own window, beneath the transparent
webview, with Grid's Svelte controls composited on top — the same player UI as
on Linux, driven over IPC rather than through a DOM element. Linux keeps the
`<video>` element and bundles no player.

| File in `src-tauri/bin/`         | Platform       |
| -------------------------------- | -------------- |
| `mpv-x86_64-pc-windows-msvc.exe` | Windows x86-64 |

> **Not committed yet.** `src-tauri/bin/mpv-*` and `src-tauri/tauri.windows.conf.json`
> are both gitignored while the licensing route is settled, and must land together —
> the config registers the binary, and Tauri's build script fails when it is absent: the only Windows build published upstream is GPLv2+, and
> bundling it would put a source-distribution obligation on every release. The
> plan is to ship an LGPL build instead — see
> [`src-tauri/licenses/README.md`](src-tauri/licenses/README.md). Put a local copy
> there to run native playback during development.

Because it is Windows-only, it is declared in `src-tauri/tauri.windows.conf.json`
rather than the shared `tauri.conf.json` — Tauri resolves `externalBin` per target
triple, so listing `bin/mpv` in the shared config would make `npm run tauri build`
fail on Linux and macOS with a missing `mpv-<triple>`. Tauri v2 merges
`tauri.<platform>.conf.json` automatically, replacing arrays rather than
concatenating them, which is why that file repeats `bin/rqbit`.

mpv is driven as a **separate process** over a JSON IPC pipe
(`src-tauri/src/mpv_player.rs`), never by linking `libmpv-2.dll`. That distinction
is a licensing one, not a technical preference — see
[`src-tauri/licenses/README.md`](src-tauri/licenses/README.md).

To update it:

1. Put the binary at `src-tauri/bin/mpv-x86_64-pc-windows-msvc.exe`.
2. Confirm it is self-contained: copy it alone to an empty directory and run
   `mpv.exe --version` there. A good build needs no sibling DLLs.
3. Confirm it still decodes what Grid needs: `mpv.exe --vd=help` must list `h264`
   and `hevc`.
4. Update the version, licence and source links in
   `src-tauri/licenses/README.md`.

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

The Windows build will additionally bundle mpv (and the FFmpeg linked into it). Grid runs it as a separate process and ships no third-party player code inside its own executable. No mpv binary is committed or distributed yet — see [`src-tauri/licenses/`](src-tauri/licenses/) for the licensing route and what it still needs.
