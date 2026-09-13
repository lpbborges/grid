# Grid-Play

Grid-Play is a native desktop application built with **Tauri**, **SvelteKit**, **TypeScript**, and **Rust**. It provides a sleek, Evangelion-themed interface for browsing popular movies via Cinemeta and streaming them directly using a built-in BitTorrent engine (`rqbit`).

## Features

- **Cinemeta & YTS Integration:** Browse popular movies and TV series with high-quality fallback metadata.
- **Instant Search:** Live catalog search across the full Cinemeta library — movies and series found by title as you type, with debounced API queries.
- **Metadata Translation:** Movie and series titles, synopses, and episode names from Cinemeta are translated on the fly into the system language reported by the webview, and cached locally. Only this metadata is translated: the app interface itself is in Brazilian Portuguese (pt-BR).
- **Cinematic UI:** Beautiful fully-opaque movie/series poster backgrounds with Stremio-style gradients that blend seamlessly with the Evangelion theme.
- **Torrent Engine Integration:** Seamless streaming powered by the `rqbit` sidecar for both Movies and TV Series (via Torrentio).
- **Video Cache:** Downloaded videos are kept in a persistent cache under the app data directory (`downloads/`, tracked by `manifest.json`) so rewatching doesn't download again. The cache is capped at 3 GB by default; when a new video needs space, the least recently watched entries are evicted. Videos larger than the cap stream normally and are deleted when playback ends.
- **TV Series Playback:** Full support for season/episode selection and dynamic metadata/subtitle loading.
- **Global Playback Preferences:** Audio, Subtitle, and Quality preferences set once and remembered across the app (persisted locally). Grid-Play ranks and picks the best matching torrent from YTS + Torrentio behind the scenes and silently enables the right embedded audio/subtitle track when playback starts, resolving the movie/show's real original language instead of guessing.
- **Frameless Design:** Desktop window with custom controls and a draggable header.
- **Evangelion Unit-01 Theme:** A unique visual identity built with Tailwind CSS v4 featuring neon glows, digital grid backgrounds, and cyberpunk typography (Orbitron/Rajdhani).
- **Advanced Media Player:** Dedicated full-screen cinematic player overlay featuring real-time download progress tracking, custom Svelte 5 video controls, multi-track audio selection, on-the-fly SRT-to-VTT subtitle conversion, and grouped menus for both Embedded (torrent) and Extra (downloaded) subtitles.
- **Test-Driven:** Vitest and Svelte Testing Library tests for the frontend, plus Rust unit tests for the backend. Run `npm run test:frontend:cov` for the current coverage report.
- **Robust Error Handling:** Resilient polling for engine startup, dynamic port allocation to prevent address conflicts, and timeouts on external API calls. Metadata translation tries Google Translate first and MyMemory as a backup; if both fail, the original English text is shown.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).

## Scripts

- `npm run dev` - Start the frontend dev server only. Browsing and search work in a plain browser, but playback, subtitles, and the video cache need the Tauri backend, so use `npm run tauri dev` for those.
- `npm run tauri dev` - Start the Tauri window and dev server.
- `npm run test:frontend` - Run the frontend test suite.
- `npm run test:frontend:cov` - Run the frontend tests with a coverage report.
- `npm run test:backend` - Run the Rust unit tests.
- `npm run test:backend:cov` - Run the Rust tests with a coverage report (requires [`cargo-llvm-cov`](https://github.com/taiki-e/cargo-llvm-cov)).
- `npm run check` - Verify TypeScript typings.
- `npm run check:watch` - Verify TypeScript typings in watch mode.
- `npm run lint` - Lint the codebase using ESLint.
- `npm run format` - Format the codebase using Prettier.
