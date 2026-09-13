import { describe, it, expect } from 'vitest';
// @ts-expect-error type error without @types/node package
import * as fs from 'node:fs';
// @ts-expect-error type error without @types/node package
import * as path from 'node:path';

describe('Tailwind Theme & CSS Variables Validation', () => {
  const appCssPath = path.resolve('src/app.css');
  const appCss = fs.readFileSync(appCssPath, 'utf-8');
  // Property context prefixes that Tailwind prepends to color utility classes.
  // Including these prefixes in @theme --color-* names causes duplicated class names
  // such as text-text-main, bg-bg-dark, accent-accent-green, border-border-default, etc.
  const FORBIDDEN_COLOR_PREFIXES = [
    'text-',
    'bg-',
    'accent-',
    'border-',
    'ring-',
    'fill-',
    'stroke-',
    'outline-',
    'shadow-',
    'divide-',
    'caret-',
    'decoration-'
  ];

  it('disallows redundant property context prefixes in @theme --color-* variables', () => {
    const themeMatch = appCss.match(/@theme\s*\{([^}]+)\}/);
    expect(themeMatch).toBeTruthy();

    const themeBlock = themeMatch![1];
    const colorVarRegex = /--color-([a-zA-Z0-9-]+)\s*:/g;

    const violatingVars: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = colorVarRegex.exec(themeBlock)) !== null) {
      const varName = match[1];
      for (const prefix of FORBIDDEN_COLOR_PREFIXES) {
        if (varName.startsWith(prefix)) {
          violatingVars.push(`--color-${varName} (redundant prefix '${prefix}')`);
        }
      }
    }

    expect(
      violatingVars,
      `Found @theme color variables with redundant property prefixes: \n${violatingVars.join('\n')}\n` +
        `Tailwind automatically prepends property prefixes (e.g. 'accent-', 'text-', 'bg-'). ` +
        `Use base names like '--color-green' instead of '--color-accent-green' to avoid generating ` +
        `duplicated classes like 'accent-accent-green'.`
    ).toEqual([]);
  });

  it('disallows duplicated utility prefixes in source files (e.g. text-text, accent-accent, bg-bg)', () => {
    const sourceFiles = import.meta.glob<string>(
      ['../*.{svelte,ts,js,html}', '../**/*.{svelte,ts,js,html}', '!**/*.test.ts'],
      { query: '?raw', import: 'default', eager: true }
    );

    const duplicatedClassRegex =
      /\b(text-text|bg-bg|accent-accent|border-border|ring-ring)-[a-zA-Z0-9_-]+/g;
    const violations: { file: string; line: number; match: string }[] = [];

    for (const [file, content] of Object.entries(sourceFiles)) {
      const lines = content.split('\n');
      lines.forEach((line: string, lineIndex: number) => {
        let m: RegExpExecArray | null;
        while ((m = duplicatedClassRegex.exec(line)) !== null) {
          violations.push({
            file,
            line: lineIndex + 1,
            match: m[0]
          });
        }
      });
    }

    expect(
      violations,
      `Found duplicated utility classes in source files: \n` +
        violations.map((v) => `  ${v.file}:${v.line} -> ${v.match}`).join('\n') +
        `\nUse clean utility classes (e.g. 'accent-green' instead of 'accent-accent-green').`
    ).toEqual([]);
  });

  it('uses clean semantic tokens in :root and disallows --accent-error', () => {
    const rootMatch = appCss.match(/:root\s*\{([^}]+)\}/);
    expect(rootMatch).toBeTruthy();

    const rootBlock = rootMatch![1];
    expect(rootBlock).not.toContain('--accent-error');
    expect(rootBlock).toContain('--error:');
    expect(rootBlock).toContain('--accent:');
    expect(rootBlock).toContain('--secondary:');
    expect(rootBlock).toContain('--green:');
    expect(rootBlock).toContain('--orange:');
  });
});
