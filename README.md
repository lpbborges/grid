# Grid-Play

Grid-Play is a native desktop application built with **Tauri**, **SvelteKit**, **TypeScript**, and **Rust**. It provides a sleek, Evangelion-themed interface for browsing popular movies via Cinemeta and streaming them directly using a built-in BitTorrent engine (`rqbit`).

## Features

- **Cinemeta Integration:** Browse popular movies.
- **Torrent Engine Integration:** Seamless streaming powered by the `rqbit` sidecar.
- **Advanced Media Player:** Custom Svelte 5 video controls with multi-track audio selection, on-the-fly SRT-to-VTT subtitle conversion, and grouped menus for both Embedded (torrent) and Extra (downloaded) subtitles.
- **Evangelion Unit-01 Theme:** A unique visual identity using Tailwind CSS v4.
- **Test-Driven:** Comprehensive Vitest and Svelte Testing Library setup with 100% test coverage for frontend modules, plus backend Rust unit tests.
- **Robust Error Handling:** Resilient polling for engine startup and graceful API fallbacks.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).

## Scripts

- `npm run dev` - Start the development server.
- `npm run tauri dev` - Start the Tauri window and dev server.
- `npm run test:frontend` - Run the frontend test suite.
- `npm run check` - Verify TypeScript typings.
- `npm run lint` - Lint the codebase using ESLint.
