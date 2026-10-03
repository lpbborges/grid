import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

// Raw Tailwind color utilities (e.g. `text-red-500`, `bg-black`, `hover:text-white`) that
// bypass the app's CSS-variable theme tokens (primary/green/orange/error/dark/surface/main/muted
// defined in src/app.css's @theme block). Catches drift like the mismatched error colors and
// hover states found in the 2026-09-13 UI review. Legitimate raw black/white (e.g. a true-black
// video backdrop) should get a targeted `eslint-disable-next-line no-restricted-syntax` with a
// comment explaining why, rather than widening this pattern.
const RAW_TAILWIND_COLOR =
  '(?:(?:hover|focus|focus-visible|focus-within|active|group-hover|group-focus|dark|disabled):)*' +
  '(?:text|bg|border|ring|from|via|to|divide|outline|decoration|placeholder|caret|accent|fill|stroke)-' +
  '(?:red|white|black|blue|yellow|pink|indigo|purple|gray|grey|slate|zinc|neutral|stone|amber|lime|emerald|teal|cyan|sky|violet|fuchsia|rose)' +
  '(?:-[0-9]{2,3})?(?:\\/[0-9]{1,3})?\\b';

// Design tokens live in src/app.css and the primitives in src/lib/components/ui. Elsewhere, bare
// `rounded` (same as `rounded-sm`), `rounded-xs|lg|xl`, arbitrary `shadow-[...]` and `z-[...]` are
// banned: use `rounded-sm`/`rounded-md`, the `shadow-*` tokens and the `z-*` layer utilities.
const BARE_TOKEN_START = '(?:^|[\\s:])';
const BARE_TOKEN_END = '(?:$|\\s)';
const UI_TOKEN_PATTERNS = [
  [
    `${BARE_TOKEN_START}rounded${BARE_TOKEN_END}`,
    'Bare `rounded` is the same as `rounded-sm`; use `rounded-sm`.'
  ],
  [
    `${BARE_TOKEN_START}rounded-(?:xs|lg|xl)${BARE_TOKEN_END}`,
    'Use `rounded-sm` (controls, containers) or `rounded-md` (modal cards).'
  ],
  [
    `${BARE_TOKEN_START}shadow-\\[`,
    'Arbitrary shadows are banned: use a `shadow-*` token from src/app.css.'
  ],
  [
    `${BARE_TOKEN_START}-?z-\\[`,
    'Arbitrary z-index is banned: use a layer utility (`z-raised`, `z-dropdown`, `z-modal`, ...) from src/app.css.'
  ]
];
const rawColorRestriction = {
  selector: `SvelteLiteral[value=/${RAW_TAILWIND_COLOR}/], TemplateElement[value.raw=/${RAW_TAILWIND_COLOR}/], Literal[value=/${RAW_TAILWIND_COLOR}/]`,
  message:
    'Raw Tailwind color utility bypasses the theme tokens in app.css (--color-primary/green/orange/error/dark/surface/main/muted). Use a token class instead, or if this is intentionally off-palette (e.g. a true-black video backdrop), suppress with a targeted eslint-disable-next-line comment explaining why.'
};
const uiTokenRestrictions = UI_TOKEN_PATTERNS.map(([pattern, message]) => ({
  selector: `SvelteLiteral[value=/${pattern}/], TemplateElement[value.raw=/${pattern}/], Literal[value=/${pattern}/]`,
  message
}));

/** @type {import('eslint').Linter.Config[]} */
export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'svelte/no-navigation-without-resolve': 'off',
      'svelte/require-each-key': 'off',
      'no-restricted-syntax': ['error', rawColorRestriction, ...uiTokenRestrictions]
    }
  },
  {
    files: ['**/*.test.ts', 'src/setupTests.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    files: ['src/lib/components/ui/**', '**/*.test.ts', 'eslint.config.js'],
    rules: {
      'no-restricted-syntax': ['error', rawColorRestriction]
    }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser
      }
    }
  },
  {
    files: ['e2e/**/*.ts', 'scripts/**/*.{js,mjs,ts}'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    ignores: ['build/', '.svelte-kit/', 'src-tauri/target/', 'coverage/']
  }
];
