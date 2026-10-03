# Grid

Grid is a native desktop application built with Tauri, SvelteKit, TypeScript, and Rust. It lets you browse movies and TV series via Cinemeta and stream them directly using the `rqbit` engine.

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

The SvelteKit frontend runs in the Tauri webview, fetching from APIs and invoking Rust commands. The Rust backend handles sidecar spawning, stream proxying, cache management, and native playback via libmpv. WebKitGTK requires a stream proxy (`src-tauri/src/stream_proxy.rs`) to patch headers in Matroska and MP4 files so embedded subtitles work. The first time it sees a stream it also reads the last 8 MiB of larger files, so the engine downloads the file's index (Matroska cues, MP4 `moov`) ahead of everything else, and the native player shows a buffering overlay whenever mpv waits for data. Hovering a card for a moment (or focusing it with the keyboard) opens a details card with the genres and runtime, read from Cinemeta and cached in memory; Settings can turn it off. Preferences, progress and the user's lists (Favoritos, Assistir depois and their own) live in `localStorage`, translations in IndexedDB, and the video cache in the app data directory.

The UI is built from internal primitives in `src/lib/components/ui/` (Button, IconButton, Icon, Menu, Select, TextField, Panel, Modal, Label) and the design tokens in `src/app.css` (border tints, shadows, stacking layers). Dismiss, menu keyboard and focus-trap behaviour live in `src/lib/composables/` (`useDismissable`, `useMenu`, `useFocusTrap`). Component tests may use `vitest-axe` for accessibility checks.

## Sidecars and dependencies

Grid uses `rqbit` as a streaming engine sidecar. For native playback on Linux and Windows, Grid links libmpv in-process. Development builds link the system library, while release builds bundle an LGPL build.

## Data sources and privacy

Grid talks directly to Cinemeta and a YTS mirror for metadata, Wikidata to search by Brazilian or original titles (sending the search text), Torrentio for stream sources, and OpenSubtitles for external subtitles (sending the video file name and size). Titles, synopses and episode names are sent to Google Translate or MyMemory if the system language is not English. The streaming engine announces streams to trackers and the DHT. The trailer button opens the trailer on YouTube in the system browser; the app itself never contacts YouTube.

## Troubleshooting

If the player fails to start, check that the `rqbit` sidecar is executable in `src-tauri/bin/`. The dev server requires port 1420; stop other processes if it is in use. To free the space taken by downloaded videos, use "Limpar vídeos baixados" on the settings screen; the video playing at that moment, if any, is kept.

## Disclaimer

Grid does not host, index, or distribute content. It plays streams returned by third-party services using a peer-to-peer engine. You are responsible for ensuring your use is legal where you live.

## License

MIT © 2026 LP

Linux and Windows release builds bundle an LGPL-2.1-or-later build of libmpv. See `src-tauri/licenses/` for details.
