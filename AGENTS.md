# Grid: Agent & Developer Guidelines

This document serves as a living repository of the core architectural decisions, conventions, and best practices established for the **Grid** project. Any AI agent or developer working on this codebase should adhere to these rules.

## Command Cheat-Sheet

| Task                                             | Command                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| Frontend only (no playback)                      | `npm run dev`                                                               |
| Full app                                         | `npm run tauri dev`                                                         |
| Release bundles                                  | `npm run tauri build`                                                       |
| Type check                                       | `npm run check`                                                             |
| Lint / format                                    | `npm run lint` / `npm run format`                                           |
| Frontend tests (+ coverage)                      | `npm run test:frontend` (`test:frontend:cov`)                               |
| Rust tests (+ coverage)                          | `npm run test:backend` (`test:backend:cov`)                                 |
| E2E playback tests (Linux/Windows)               | `npm run test:e2e` (`test:e2e:run` skips the build)                         |
| Live smoke test (manual, internet)               | `npm run test:e2e:live`                                                     |
| Refresh rqbit response snapshots                 | `cd src-tauri && UPDATE_RQBIT_SNAPSHOTS=1 cargo test playback_engine_tests` |
| Rust format / lint                               | `cd src-tauri && cargo fmt && cargo clippy --all-targets -- -D warnings`    |
| Fetch the pinned libmpv (Windows; Linux release) | `npm run setup:libmpv`                                                      |

## 1. Architecture & Modularity

- **No Monolithic Files:** Do not cram logic, API fetching, and complex UI into a single Svelte component (like `+page.svelte`).
- **ONLY Svelte 5 Runes:** Always use Svelte 5 Runes (`$state`, `$derived`, `$effect`, `$props`, etc.) for ALL new components and refactorings. Do not use legacy syntax (`export let`, reactive statements like `$:`, `$app/stores`) in new code.
- **Separation of Concerns:**
  - UI elements belong in `src/lib/components/`.
  - External API calls (Cinemeta, Torrentio, subtitles, translation) belong in `src/lib/api/`.
  - Core app logic and backend wrappers (engine, cache, ranking, orchestration) belong in `src/lib/engine/`.
  - Reusable reactive logic extracted from components (`useStreamPlayer`, `useAudioTrackSelection`, ...) belongs in `src/lib/composables/`.
  - Persisted app-wide state belongs in `src/lib/stores/*.svelte.ts`; small transient UI state shared across routes lives in `src/lib/stores.svelte.ts`.
  - Pure helpers belong in `src/lib/utils/`. Log through `src/lib/logger.ts`, never `console` directly.
  - **Types:** co-locate a type with the only module that uses it. Shapes shared by more than one module (e.g. `Movie`, `Series`, `Episode`, `AudioPreference`) belong in `src/lib/types.ts`.
- **SvelteKit Data Loading:** Do NOT use `onMount` for initial data fetching in routes. Always use a `load` function in a corresponding `+page.ts` file to fetch data before the page renders. This ensures proper reactivity when navigating between different IDs on the same route (e.g., navigating from `/movie/1` to `/movie/2`). If a component must still start a request itself, guard its result against the route having changed before applying it.
- **State Synchronization:** When a value derives from props but also needs local overrides, use a writable `$derived` (Svelte ≥ 5.25) instead of copying the prop into `$state` with an `$effect`. Reassigning it overrides the value until its dependencies change:

  ```svelte
  <script lang="ts">
    let { data } = $props();
    let error = $derived(data.error ? 'Não foi possível carregar este título.' : '');

    function onPlaybackFailed() {
      error = 'Não foi possível iniciar a reprodução.';
    }
  </script>
  ```

- **`localStorage`-backed Stores (`src/lib/stores/*.svelte.ts`):** Wrap persisted fields in a `get`/`set` accessor pair that writes to `localStorage` inside the setter (see `settings.svelte.ts`). Never expose a public `save()` method that callers must remember to invoke after every mutation — that duplicates the persistence call at every call site and silently drops state if one is forgotten. Validate anything read back from `localStorage` (types, ranges) before using it, and throttle writes inside the store for high-frequency updates (see `progress.svelte.ts`).
- **Tauri Native Features:** When heavy lifting is required (like streaming), rely on Rust via Tauri commands or pre-compiled native binaries distributed as Tauri Sidecars (e.g., `rqbit`). Avoid heavy Node.js runtimes in the frontend. Ensure all Rust implementations are cross-platform by using crates like `sysinfo` and standard library functions instead of hardcoding OS-specific shell commands or absolute paths. For app-owned files (caches, manifests, PID files), use Tauri path APIs (`app_data_dir`, `app_cache_dir`) rather than `std::env::temp_dir()`, which is shared and world-writable on Unix.

## 2. Type Safety

- **Strict TypeScript:** All data boundaries, API responses, and component props must be strictly typed. Type JSON from external APIs with an interface (see `CinemetaMeta`) or narrow `unknown` before use.
- **No `any`:** `@typescript-eslint/no-explicit-any` is an error outside test files, and `svelte-check` must report 0 errors and 0 warnings.
- **Route Parameters:** Read route params from `page` in `$app/state` (e.g. `page.params.id`) or from the `params` passed to `load`, and type them explicitly (e.g. `as string`) before usage.

## 3. Testing Standards

- **Test-Driven:** All new utility modules and complex UI components must be accompanied by unit tests. Write the failing test first for bug fixes.
- **Frontend Framework:** We use `vitest` for the runner and `@testing-library/svelte` for component testing.
- **Backend Framework:** We use standard Rust unit tests (`cargo test`) located in the same module (`#[cfg(test)] mod tests`) for backend logic. Test behavior, not that a `Mutex` holds what was put in it; local mock HTTP servers (see `spawn_mock_engine_server`) are preferred over asserting on helpers.
- **Mocking:**
  - Mock Tauri IPC with `vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))`.
  - Mock `fetch` with `vi.fn()` / `vi.spyOn(globalThis, 'fetch')`.
  - IndexedDB is provided by `fake-indexeddb` in tests.
  - When a module mock replaces a whole module, keep it in sync with the module's real exports (use `importOriginal` when only some exports need mocking).
- **Composables:** Test `$effect`-based composables through a tiny harness component in a sibling `__fixtures__/` folder (see `composables/__fixtures__/StreamPlayerHarness.svelte`).
- **Module state:** Use `vi.resetModules()` and a dynamic `import()` per test for modules with module-level state (stores, `torrent.ts`).
- **File Naming:** Tests must live alongside their implementation (e.g., `cinemeta.test.ts` next to `cinemeta.ts`).
- **Coverage:** There is no enforced threshold; check `npm run test:frontend:cov` and don't lower coverage of the files you touch.
- **Playback safety net:** Any change touching the play path (`src/lib/api/torrentio.ts`, `src/lib/api/endpoints.ts`, `src/lib/engine/`, `useStreamPlayer`, `usePlayer`, `useDomBackend`, `useMpvBackend`, `Player`, `PlayerShell`, the movie/series pages, `stream_proxy.rs`, `media_patch/`, `mpv_player.rs` and the native Windows playback path, the sidecars) must keep `*-playback.test.ts` and `playback_engine_tests` green and must pass `npm run test:e2e` locally before it is committed. Add a wiring or E2E assertion for every playback bug you fix. Never point these tests at real external services; fake new services in `playbackBoundary.ts` and `e2e/support/mockServer.ts`, and add their base URL to `src/lib/api/endpoints.ts`.

## 4. UI & Styling

- **Theme Consistency:** We strictly adhere to the project's style guide. Use the theme tokens defined in `src/app.css` (`primary`, `accent`, `secondary`, `green`, `orange`, `dark`, `surface`, `main`, `muted`, `error`, `backdrop`).
- **Tailwind v4:** All styling should be implemented using Tailwind utility classes. Global CSS variables for the theme are maintained in `src/app.css`.
- **No raw Tailwind colors:** ESLint (`no-restricted-syntax` in `eslint.config.js`) rejects raw color utilities such as `text-red-500` or `bg-black`. If a color is intentionally off-palette (e.g. a true-black video backdrop), add a targeted `eslint-disable-next-line no-restricted-syntax` with a reason instead of widening the rule.
- **Tailwind v4 Variable Naming:** When adding custom variables to `@theme` in `src/app.css` (e.g. `--color-*`), do NOT include property contexts like `bg-`, `text-`, or `accent-` in the variable name. Tailwind automatically prepends these contexts. Use base names (e.g., `--color-dark` instead of `--color-bg-dark`, `--color-green` instead of `--color-accent-green`) to avoid generating redundant utility classes like `bg-bg-dark`, `text-text-main`, or `accent-accent-green`. This is enforced automatically by `src/lib/theme.test.ts`.
- **Fonts:** Fonts are bundled via `@fontsource` packages imported in `src/app.css`. Never load fonts or styles from a CDN; the CSP blocks them in release builds.
- **Window transparency:** the main window is `transparent: true` because mpv renders behind the webview on Windows. `src/app.html` wraps the body in a `display: contents` div, so the layout's opaque root is `body > div > div` — one level deeper than it looks. Any new opaque ancestor above the player hides the video completely, and the failure looks exactly like broken compositing rather than a CSS bug.
- **Responsive Design:** Desktop application layouts should remain responsive and gracefully handle window resizing down to the minimum window size set in `tauri.conf.json`.

## 5. Tauri & Rust

- **Commands:** Register every command in `tauri::generate_handler!` in `src-tauri/src/lib.rs`. Make commands `async` when they do any I/O, and move blocking filesystem or process work into `tauri::async_runtime::spawn_blocking`.
- **CSP:** Any new external host must be added to `app.security.csp` in `src-tauri/tauri.conf.json`, and CSP expectations are covered by the `csp_*` tests in `lib.rs`.
- **Subtitle fetching:** External subtitle URLs and every redirect target must pass `is_allowed_subtitle_url` (the strem.io allowlist). The frontend caps subtitle fetches below the Rust rate limit (`SUBTITLE_RATE_LIMIT_PER_MINUTE`); change both together.
- **TS/Rust parity:** Validators exist on both sides and must agree: `isValidInfoHash` ↔ `is_valid_info_hash`, `isValidFileIdx` ↔ `is_valid_file_idx`, and subtitle/video extension checks (case-insensitive on both sides).
- **Sidecar:** Binaries in `src-tauri/bin/` must be named `<name>-<target-triple>[.exe]` (see README → Sidecars). After replacing the binaries, refresh `tests/fixtures/rqbit/` with `UPDATE_RQBIT_SNAPSHOTS=1` and update `src/lib/engine/__fixtures__/fakeRqbit.ts` if the response shapes changed.
- **Sidecar lifetime:** Spawn the engine through `engine_process::spawn_tied_to_app` (Linux parent-death signal, Windows kill-on-close Job Object) so it stops when the app is killed. On Linux the signal follows the spawning thread, so never spawn it inside `spawn_blocking`. macOS relies on the PID-file cleanup at the next launch.
- **Magnet adds:** rqbit tries each source only once while resolving a magnet, so a source that never answers hangs `POST /torrents`. `addTorrent` retries with growing timeouts (`ADD_ATTEMPT_TIMEOUTS_MS`); keep that behavior and `a_magnet_add_stalled_by_a_silent_source_succeeds_when_added_again` in sync when updating the sidecar.
- **Stream proxy:** The `<video>` element must load streams from `getStreamUrl` (the Rust stream proxy in `stream_proxy.rs`), never from rqbit directly. WebKitGTK stalls on MP4 and Matroska files with embedded subtitle tracks while they are still downloading, and the proxy hides those tracks in the header (`media_patch/`) without changing byte offsets.

- **Raw streams:** The header patch above hides every embedded subtitle track, so anything that demuxes Matroska correctly must ask for `?raw=1` (`getStreamUrl(hash, idx, { raw: true })`). The `<video>` element must not: it needs the patch. Keep the Rust `wants_raw` check and the TS option in sync.
- **mpv sidecar (Windows):** Declared in `src-tauri/tauri.windows.conf.json`, never the shared `tauri.conf.json` — `externalBin` resolves per target triple, so a shared entry breaks `tauri build` on Linux and macOS. mpv is always a **separate process** over JSON IPC (`mpv_player.rs`); linking `libmpv-2.dll` would make Grid's MIT code a GPL derivative (see `src-tauri/licenses/`). It is launched with `--wid` so it renders **inside** Grid's window, beneath the transparent webview, and `window_embed.rs` pushes it to the bottom of the child z-order once at startup. Grid's own Svelte controls drive it — mpv's OSC, cursor and keyboard handling are all off. Keep the command surface narrow: mpv's own commands include `run` and `load-script`, so never add a generic passthrough. The IPC endpoint name is randomised per launch and must never be logged, and `start_native_player` must reject any URL that is not the local stream proxy.

## 6. Code Quality & Git

- **Formatting & Linting:** `eslint` and `prettier` are mandated for all TS/JS/Svelte code. `cargo fmt` and `cargo clippy --all-targets -- -D warnings` are mandated for Rust code.
- **Versioning:** `package.json` is the single source of truth for the application version; `src-tauri/tauri.conf.json` references it dynamically via `"../package.json"`. Do not bump versions on individual functional commits or PRs; version bumps follow SemVer and are performed intentionally when preparing a release or release tag. Keep `src-tauri/Cargo.toml` in sync when bumping versions for a release.
- **Pre-commit Hook:** `.husky/pre-commit` runs `lint-staged` (ESLint + Prettier on staged files), the full frontend test suite, the full Rust test suite, `cargo fmt --check`, and `cargo clippy`. A commit therefore takes a minute or more. Never bypass this hook unless absolutely necessary. It runs against the working tree, so don't leave intentionally failing tests unstaged while committing something else.
- **CI:** `.github/workflows/ci.yml` runs lint, Prettier, `svelte-check`, the frontend tests, `cargo fmt`, `clippy`, `cargo test`, `npm audit`, `cargo audit`, and, after those pass, the `e2e` job on Linux and Windows.
- **Commits:** Use Conventional Commits (`feat:`, `fix:`, `refactor:`, `perf:`, `test:`, `docs:`, `chore:`, `ci:`) with small, atomic commits.
- **Plans & specs:** Never commit planning or spec documents. `.claude/plans/`, `docs/superpowers/` and `.backlog/` are gitignored.

## 7. Documentation

Update `README.md` in the same change whenever you:

- add or change a user-visible feature (**Features**);
- add or rename an npm script (**Scripts**);
- add, remove, or change an external service (**Data Sources & Privacy**, plus the CSP);
- change where state is stored or how the frontend talks to the backend (**Architecture**);
- update or add a sidecar (**Sidecars**);
- change setup requirements (**Prerequisites**, **Getting Started**).

## 8. User Experience & Terminology

- **UI Language is pt-BR:** All user-facing copy (labels, status messages, errors, empty states, date formatting) is written in Brazilian Portuguese, and `src/app.html` declares `lang="pt-BR"`. There is no i18n layer, so hardcode new strings in pt-BR. Only Cinemeta metadata (titles, synopses, episode names) is translated at runtime into the system language. Code, identifiers, logs, comments, and docs stay in English.
- **User-Friendly Language:** The app should function like Netflix for non-technical users. NEVER mention technical terms like "torrent", "magnet", "seeders", or "peers" in the UI. Use simple, familiar terms like "Stream", "Play", "Loading", "Quality", etc., instead.
- **Product name:** The app is called "Grid" everywhere (README, window title, `productName`, `<title>`, logo).

---

_Note: This file should be continuously updated whenever a new architectural rule, workflow, or significant library is introduced._
