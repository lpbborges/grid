# Grid

Grid is a native desktop application built with Tauri, SvelteKit, TypeScript, and Rust. It lets you browse movies and TV series via Cinemeta and stream them directly using the `rqbit` engine.

## Features

Grid integrates with Cinemeta and YTS for catalog browsing and live search, which also finds titles by their Brazilian or original name through Wikidata. It translates titles and synopses into the system language. Streaming runs through an `rqbit` sidecar via Torrentio, with downloaded videos kept in a 3 GB local cache. The app tracks watch progress, and a "Continuar assistindo" row on the home screen picks up where you left off. Series open on the next episode to watch, and a series page opens on the season you watched most recently. Global preferences for audio, subtitles, and quality pick the best source automatically. The player uses a `<video>` element on macOS and an in-process libmpv instance on Linux and Windows, supporting multi-track audio and on-the-fly subtitle conversion.

## Prerequisites

Grid requires Node.js 24 and a Rust toolchain. You also need the Tauri OS dependencies for your system. Linux and Windows require libmpv development files for native playback.

## Getting started

```sh
npm install
npm run tauri dev
```

To build release bundles:

```sh
npm run tauri build
```

Windows requires running `npm run setup:libmpv` first. Linux uses `npm run setup:libmpv -- --bundle && npm run bundle:linux` to package the bundled LGPL libmpv.

## Recommended IDE setup

Use VS Code with the Svelte, Tauri, and rust-analyzer extensions.

## Scripts

- `npm run dev`: starts the frontend dev server.
- `npm run tauri dev`: starts the Tauri window and dev server.
- `npm run tauri build`: builds release bundles.
- `npm run bundle:linux`: builds the Linux packages with the bundled libmpv.
- `npm run test:frontend`: runs frontend tests.
- `npm run test:backend`: runs Rust tests.
- `npm run test:e2e`: builds the app and runs end-to-end tests.
- `npm run check`: verifies TypeScript typings.
- `npm run lint` and `npm run format`: lint and format the codebase.
- `npm run setup:libmpv`: downloads the pinned LGPL libmpv for Windows and Linux release packaging.

## Architecture

The SvelteKit frontend runs in the Tauri webview, fetching from APIs and invoking Rust commands. The Rust backend handles sidecar spawning, stream proxying, cache management, and native playback via libmpv. WebKitGTK requires a stream proxy (`src-tauri/src/stream_proxy.rs`) to patch headers in Matroska and MP4 files so embedded subtitles work. Preferences and progress live in `localStorage`, translations in IndexedDB, and the video cache in the app data directory.

## Sidecars and dependencies

Grid uses `rqbit` as a streaming engine sidecar. For native playback on Linux and Windows, Grid links libmpv in-process. Development builds link the system library, while release builds bundle an LGPL build.

## Data sources and privacy

Grid talks directly to Cinemeta and a YTS mirror for metadata, Wikidata to search by Brazilian or original titles (sending the search text), Torrentio for stream sources, and OpenSubtitles for external subtitles (sending the video file name and size). Metadata is sent to Google Translate or MyMemory if the system language is not English. The streaming engine announces streams to trackers and the DHT.

## Troubleshooting

If the player fails to start, check that the `rqbit` sidecar is executable in `src-tauri/bin/`. The dev server requires port 1420; stop other processes if it is in use. To clear the video cache, delete the `downloads/` folder in the app data directory.

## Disclaimer

Grid does not host, index, or distribute content. It plays streams returned by third-party services using a peer-to-peer engine. You are responsible for ensuring your use is legal where you live.

## License

MIT © 2026 LP

Linux and Windows release builds bundle an LGPL-2.1-or-later build of libmpv. See `src-tauri/licenses/` for details.
