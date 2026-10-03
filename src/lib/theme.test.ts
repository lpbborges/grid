import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Returns the body of the first `{ ... }` block opened after `header`, honouring nesting. */
function balancedBlock(css: string, header: RegExp): string | null {
  const start = header.exec(css);
  if (!start) return null;
  const open = css.indexOf('{', start.index);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  return null;
}

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

function findForbiddenColorNames(themeBlock: string): string[] {
  const violations: string[] = [];
  for (const match of themeBlock.matchAll(/--color-([a-zA-Z0-9-]+)\s*:/g)) {
    for (const prefix of FORBIDDEN_COLOR_PREFIXES) {
      if (match[1].startsWith(prefix)) {
        violations.push(`--color-${match[1]} (redundant prefix '${prefix}')`);
      }
    }
  }
  return violations;
}

describe('Tailwind Theme & CSS Variables Validation', () => {
  const appCssPath = path.resolve('src/app.css');
  const appCss = fs.readFileSync(appCssPath, 'utf-8');
  const themeBlock = balancedBlock(appCss, /@theme\s*\{/) ?? '';

  it('scans the whole @theme block, past its nested @keyframes', () => {
    expect(
      balancedBlock(
        '@theme { --a: 1; @keyframes x { to { y: 1; } } --b: 2; } .z { }',
        /@theme\s*\{/
      )
    ).toContain('--b: 2');
    expect(themeBlock).toContain('--color-purple-500');
    expect(themeBlock).toContain('@keyframes logo-glitch');
    expect(themeBlock.trimEnd().endsWith('}')).toBe(true);
  });

  it('flags a forbidden --color-* name placed after a nested @keyframes block', () => {
    const css = '@theme { @keyframes x { from { a: 1; } } --color-bg-late: #000; }';
    expect(findForbiddenColorNames(balancedBlock(css, /@theme\s*\{/) ?? '')).toHaveLength(1);
  });
  it('disallows redundant property context prefixes in @theme --color-* variables', () => {
    const violatingVars = findForbiddenColorNames(themeBlock);

    expect(
      violatingVars,
      `Found @theme color variables with redundant property prefixes: \n${violatingVars.join('\n')}\n` +
        `Tailwind automatically prepends property prefixes (e.g. 'accent-', 'text-', 'bg-'). ` +
        `Use base names like '--color-green' instead of '--color-accent-green' to avoid generating ` +
        `duplicated classes like 'accent-accent-green'.`
    ).toEqual([]);
  });

  it('honours prefers-reduced-motion globally', () => {
    expect(appCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it('defines the keyframes behind the loading effects', () => {
    for (const name of ['scan-sweep', 'bracket-lock', 'boot-in']) {
      expect(appCss).toContain(`@keyframes ${name}`);
    }
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
