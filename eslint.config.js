import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

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

/** @type {import('eslint').Linter.Config[]} */
export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        globalThis: 'readonly',
        setTimeout: 'readonly',
        AbortController: 'readonly',
        clearTimeout: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'svelte/no-navigation-without-resolve': 'off',
      'svelte/require-each-key': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: `SvelteLiteral[value=/${RAW_TAILWIND_COLOR}/], TemplateElement[value.raw=/${RAW_TAILWIND_COLOR}/], Literal[value=/${RAW_TAILWIND_COLOR}/]`,
          message:
            'Raw Tailwind color utility bypasses the theme tokens in app.css (--color-primary/green/orange/error/dark/surface/main/muted). Use a token class instead, or if this is intentionally off-palette (e.g. a true-black video backdrop), suppress with a targeted eslint-disable-next-line comment explaining why.'
        }
      ]
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
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  {
    ignores: ['build/', '.svelte-kit/', 'src-tauri/target/', 'coverage/']
  }
];
