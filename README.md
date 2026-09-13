# Grid Play

Grid Play is a native desktop application built with **Tauri**, **SvelteKit**, **TypeScript**, and **Rust**. It lets you browse popular movies and TV series via Cinemeta and stream them directly using a built-in streaming engine (`rqbit`).

## Features

- **Cinemeta & YTS Integration:** Browse popular movies and TV series with high-quality fallback metadata.
- **Instant Search:** Live catalog search across the full Cinemeta library — movies and series found by title as you type, with debounced API queries.
- **Metadata Translation:** Movie and series titles, synopses, and episode names from Cinemeta are translated on the fly into the system language reported by the webview, and cached locally. Only this metadata is translated: the app interface itself is in Brazilian Portuguese (pt-BR). See [Data sources & privacy](#data-sources--privacy).
- **Cinematic UI:** Fully-opaque movie/series poster backgrounds with Stremio-style gradients.
- **Streaming Engine Integration:** Seamless streaming powered by the `rqbit` sidecar for both Movies and TV Series (via Torrentio).
- **Video Cache:** Downloaded videos are kept in a persistent cache under the app data directory (`downloads/`, tracked by `downloads/manifest.json`) so rewatching doesn't download again. The cache is capped at 3 GB by default; when a new video needs space, the least recently watched entries are evicted. Videos larger than the cap stream normally and are deleted when playback ends.
- **Watch Progress:** Playback position is remembered per movie and per episode, and home-screen cards show a progress bar (for series, the most recently watched episode).
- **TV Series Playback:** Full support for season/episode selection and dynamic metadata/subtitle loading.
- **Global Playback Preferences:** Audio, Subtitle, and Quality preferences set once and remembered across the app (persisted locally). Grid Play ranks and picks the best matching source from YTS + Torrentio behind the scenes and silently enables the right embedded audio/subtitle track when playback starts, resolving the movie/show's real original language instead of guessing.
- **Frameless Design:** Desktop window with custom controls and a draggable header.
- **Evangelion Unit-01 Theme:** A unique visual identity built with Tailwind CSS v4 featuring neon glows, digital grid backgrounds, and cyberpunk typography (Orbitron/Rajdhani, bundled locally).
- **Advanced Media Player:** Dedicated full-screen cinematic player overlay featuring real-time download progress tracking, custom Svelte 5 video controls, multi-track audio selection, on-the-fly SRT-to-VTT subtitle conversion, and grouped menus for both Embedded and Extra (downloaded) subtitles.
- **Test-Driven:** Vitest and Svelte Testing Library tests for the frontend, plus Rust unit tests for the backend. Run `npm run test:frontend:cov` for the current coverage report.
- **Robust Error Handling:** Resilient polling for engine startup, a specific error when the engine cannot start, dynamic port allocation to prevent address conflicts, and timeouts on external API calls. Metadata translation tries Google Translate first and MyMemory as a backup; if both fail, the original English text is shown.

## Prerequisites

- [Node.js](https://nodejs.org/) 24 and npm (the version CI uses).
- A stable [Rust toolchain](https://rustup.rs/).
- The Tauri system dependencies for your OS, listed in the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/). On Debian/Ubuntu:

  ```sh
  sudo apt-get install -y build-essential curl wget file libxdo-dev libssl-dev \
    libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
  ```

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
- `npm run check` - Verify TypeScript typings.
- `npm run check:watch` - Verify TypeScript typings in watch mode.
- `npm run lint` - Lint the codebase using ESLint.
- `npm run format` - Format the codebase using Prettier.

## Architecture

```
SvelteKit UI (static build, runs in the Tauri webview)
  ├─ fetch ──────────► Cinemeta / YTS mirror / Torrentio / translation APIs
  ├─ invoke ─────────► Rust commands (src-tauri/src/lib.rs)
  │                      ├─ start_torrent_engine   spawns the rqbit sidecar on a free 127.0.0.1 port
  │                      ├─ fetch_*_subtitle        fetches subtitles, converts SRT to VTT
  │                      └─ get_cache_manifest / upsert_cache_entry / evict_for_space
  └─ fetch ──────────► rqbit HTTP API on 127.0.0.1 (add, stream, stats)
```

- `src/lib/api/` wraps external services, `src/lib/engine/` drives playback (engine, cache, ranking), `src/lib/composables/` and `src/lib/stores/` hold reactive state, and `src/lib/components/` holds the UI.
- **Where state lives:**
  - `localStorage`: playback preferences (`grid-play-audio`, `grid-play-subtitle`, `grid-play-quality`, `grid-play-cache-limit-bytes`), watch progress (`grid-play-progress`) and watched titles (`grid-play-watched`).
  - IndexedDB `grid-play-translations`: the metadata translation cache.
  - App data directory: the video cache (`downloads/` and `downloads/manifest.json`).
  - App cache directory: `grid-play-engine.pid`, used to clean up an engine left behind by a crash.

## Streaming Engine Sidecar

The engine is [rqbit](https://github.com/ikatson/rqbit) 9.0.1, shipped as a [Tauri sidecar](https://v2.tauri.app/develop/sidecar/) declared in `src-tauri/tauri.conf.json` (`bundle.externalBin`). Tauri expects one binary per target, named `rqbit-<target-triple>`:

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

## Data Sources & Privacy

Grid Play talks to these services directly from your machine. Every host must also be allowed in the CSP in `src-tauri/tauri.conf.json`.

- **Cinemeta** (`v3-cinemeta.strem.io`): catalog, search, and movie/series metadata.
- **YTS mirror** (`movies-api.accel.li`): extra movie details.
- **Torrentio** (`torrentio.strem.fun`): stream sources for movies and episodes.
- **OpenSubtitles via strem.io** (`opensubtitles-v3.strem.io`, `*.strem.io`): external subtitles.
- **Google Translate** (unofficial `translate.googleapis.com` endpoint) and **MyMemory** (`api.mymemory.translated.net`): metadata translation.

**Translation privacy:** when the system language is not English, the title, synopsis, and episode names of the titles you open are sent in plain text to Google Translate (and to MyMemory if Google fails). No account data or playback history is sent. There is currently no setting to turn translation off.

## Troubleshooting

- **"Não foi possível iniciar o player"**: the engine could not start. Check that the sidecar for your platform exists in `src-tauri/bin/` and is executable, and read the `tauri dev` terminal output for `Sidecar spawn error`.
- **`Port 1420 is already in use`**: the dev server needs port 1420 (`strictPort`). Stop the other process using it. The engine itself always picks free ports.
- **A stale engine keeps running after a crash**: the next start kills it using `grid-play-engine.pid` in the app cache directory, but only if the process still looks like `rqbit`. If one survives, end the `rqbit` process manually and delete the PID file.
- **Clearing the video cache**: quit the app and delete the `downloads/` folder in the app data directory:
  - Linux: `~/.local/share/com.lp01.grid-play/`
  - macOS: `~/Library/Application Support/com.lp01.grid-play/`
  - Windows: `%APPDATA%\com.lp01.grid-play\`

## Disclaimer

Grid Play does not host, index, or distribute any content. It only plays streams that third-party services return, using a peer-to-peer engine that uploads data while downloading. You are responsible for making sure that what you watch is legal where you live.

## License

[MIT](LICENSE) © 2026 LP
