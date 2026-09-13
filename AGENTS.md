# Grid-Play: Agent & Developer Guidelines

This document serves as a living repository of the core architectural decisions, conventions, and best practices established for the **grid-play** project. Any AI agent or developer working on this codebase should adhere to these rules.

## 1. Architecture & Modularity

- **No Monolithic Files:** Do not cram logic, API fetching, and complex UI into a single Svelte component (like `+page.svelte`).
- **ONLY Svelte 5 Runes:** Always use Svelte 5 Runes (`$state`, `$derived`, `$effect`, `$props`, etc.) for ALL new components and refactorings. Do not use legacy syntax (`export let`, reactive statements like `$:`) in new code.
- **Separation of Concerns:**
  - UI Elements belong in `src/lib/components/`
  - External API calls (e.g., YTS) belong in `src/lib/api/`
  - Core app logic and backend wrappers (e.g., Torrent engine) belong in `src/lib/engine/`
  - TypeScript interfaces belong in `src/lib/types.ts`
- **SvelteKit Data Loading:** Do NOT use `onMount` for initial data fetching in routes. Always use a `load` function in a corresponding `+page.ts` file to fetch data before the page renders. This ensures proper reactivity when navigating between different IDs on the same route (e.g., navigating from `/movie/1` to `/movie/2`).
- **State Synchronization:** In Svelte 5, if you need a mutable state variable that derives its initial value from `data` props but also requires local mutation (e.g., an error message during playback), declare it as `$state` and synchronize it manually using an `$effect` block tracking the prop change. Do not attempt to reassign a `$derived` variable.
- **`localStorage`-backed Stores (`src/lib/stores/*.svelte.ts`):** Wrap persisted fields in a `get`/`set` accessor pair that writes to `localStorage` inside the setter (see `settings.svelte.ts`). Never expose a public `save()` method that callers must remember to invoke after every mutation — that duplicates the persistence call at every call site and silently drops state if one is forgotten.
- **Tauri Native Features:** When heavy lifting is required (like torrenting), rely on Rust via Tauri commands or pre-compiled native binaries distributed as Tauri Sidecars (e.g., `rqbit`). Avoid heavy Node.js runtimes in the frontend. Ensure all Rust implementations are cross-platform by using crates like `sysinfo` and standard library functions instead of hardcoding OS-specific shell commands or absolute paths. For app-owned files (caches, manifests, PID files), use Tauri path APIs (`app_data_dir`, `app_cache_dir`) rather than `std::env::temp_dir()`, which is shared and world-writable on Unix.

## 2. Type Safety

- **Strict TypeScript:** All data boundaries, API responses, and component props must be strictly typed.
- **No Implicit Any:** Maintain 100% compliance with `svelte-check`.
- **Route Parameters:** Ensure SvelteKit route params (like `$page.params.id`) are explicitly typed (e.g., `as string`) before usage.

## 3. Testing Standards

- **Test-Driven:** All new utility modules and complex UI components must be accompanied by unit tests.
- **Frontend Framework:** We use `vitest` for the runner and `@testing-library/svelte` for component testing.
- **Backend Framework:** We use standard Rust unit tests (`cargo test`) located in the same module (`#[cfg(test)] mod tests`) for backend logic.
- **Mocking:** Ensure external dependencies (like `fetch` and Tauri `invoke`) are properly mocked in test files using `vi.mock` or `vi.fn()`.
- **File Naming:** Tests must live alongside their implementation (e.g., `yts.test.ts` next to `yts.ts`).

## 4. UI & Styling

- **Theme Consistency:** We strictly adhere to the Evangelion Unit-01 style guide (Neon Green, Primary Purple, Armor Black).
- **Tailwind v4:** All styling should be implemented using Tailwind utility classes. Global CSS variables for the theme are maintained in `src/app.css`.
- **Tailwind v4 Variable Naming:** When adding custom variables to `@theme` in `src/app.css` (e.g. `--color-*`), do NOT include property contexts like `bg-`, `text-`, or `accent-` in the variable name. Tailwind automatically prepends these contexts. Use base names (e.g., `--color-dark` instead of `--color-bg-dark`, `--color-green` instead of `--color-accent-green`) to avoid generating redundant utility classes like `bg-bg-dark`, `text-text-main`, or `accent-accent-green`. This is enforced automatically by `src/lib/theme.test.ts`.
- **Responsive Design:** Desktop application layouts should remain responsive and gracefully handle window resizing.

## 5. Code Quality & Git Hooks

- **Formatting & Linting:** `eslint` and `prettier` are mandated for all TS/JS/Svelte code. `cargo fmt` and `cargo clippy` are mandated for Rust code.
- **Pre-commit Checks:** Husky and `lint-staged` are configured in `.husky/pre-commit` to guarantee that all commits are fully formatted, linted, and pass both frontend (`vitest`) and backend (`cargo test`) tests prior to committing. Never bypass this hook unless absolutely necessary.

## 6. Documentation

- **Keep README Updated:** Whenever a new feature is added, or an existing one is modified, ALWAYS update `README.md` to reflect the changes (e.g., adding descriptions of new features, updating setup instructions, or modifying usage guides).

## 7. User Experience & Terminology

- **UI Language is pt-BR:** All user-facing copy (labels, status messages, errors, empty states, date formatting) is written in Brazilian Portuguese, and `src/app.html` declares `lang="pt-BR"`. There is no i18n layer, so hardcode new strings in pt-BR. Only Cinemeta metadata (titles, synopses, episode names) is translated at runtime into the system language. Code, identifiers, logs, comments, and docs stay in English.
- **User-Friendly Language:** The app should function like Netflix for non-technical users. NEVER mention technical terms like "torrent", "magnet", "seeders", or "peers" in the UI. Use simple, familiar terms like "Stream", "Play", "Loading", "Quality", etc., instead.

---

_Note: This file should be continuously updated whenever a new architectural rule, workflow, or significant library is introduced._
