# Grid-Play

Grid-Play is a native desktop application built with **Tauri**, **SvelteKit**, **TypeScript**, and **Rust**. It provides a sleek, Evangelion-themed interface for browsing popular movies via Cinemeta and streaming them directly using a built-in BitTorrent engine (`rqbit`).

## Features

- **Cinemeta & YTS Integration:** Browse popular movies and TV series with high-quality fallback metadata.
- **Instant Search:** Live catalog search across the full Cinemeta library — movies and series found by title as you type, with debounced API queries.
- **Localization:** Automatically translates movie and series titles, synopses, and episode names into the user's native system language on the fly.
- **Cinematic UI:** Beautiful fully-opaque movie/series poster backgrounds with Stremio-style gradients that blend seamlessly with the Evangelion theme.
- **Torrent Engine Integration:** Seamless streaming powered by the `rqbit` sidecar for both Movies (via YTS) and TV Series (via Torrentio). Includes automatic background-cleanup of previous streams to save bandwidth and disk space.
- **TV Series Playback:** Full support for season/episode selection and dynamic metadata/subtitle loading.
- **Global Playback Preferences:** Audio, Subtitle, and Quality preferences set once and remembered across the app (persisted locally). Grid-Play ranks and picks the best matching torrent from YTS + Torrentio behind the scenes and silently enables the right embedded audio/subtitle track when playback starts, resolving the movie/show's real original language instead of guessing.
- **Frameless Design:** Desktop window with custom controls and a draggable header.
- **Evangelion Unit-01 Theme:** A unique visual identity built with Tailwind CSS v4 featuring neon glows, digital grid backgrounds, and cyberpunk typography (Orbitron/Rajdhani).
- **Advanced Media Player:** Dedicated full-screen cinematic player overlay featuring real-time download progress tracking, custom Svelte 5 video controls, multi-track audio selection, on-the-fly SRT-to-VTT subtitle conversion, and grouped menus for both Embedded (torrent) and Extra (downloaded) subtitles.
- **Test-Driven:** Comprehensive Vitest and Svelte Testing Library setup with 100% test coverage for frontend modules, plus backend Rust unit tests.
- **Robust Error Handling:** Resilient polling for engine startup, dynamic port allocation to prevent address conflicts, and graceful API fallbacks.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).

## Scripts

- `npm run dev` - Start the development server.
- `npm run tauri dev` - Start the Tauri window and dev server.
- `npm run test:frontend` - Run the frontend test suite.
- `npm run check` - Verify TypeScript typings.
- `npm run lint` - Lint the codebase using ESLint.
