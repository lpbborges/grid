import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compile } from '@tailwindcss/node';

const UI_DIR = path.resolve('src/lib/components/ui');
const SOURCES = fs
  .readdirSync(UI_DIR)
  .filter((file) => file.endsWith('.svelte') && !file.includes('.test.'));

/** Literals that look like classes but are values (a default prop), not utilities. */
const NOT_UTILITIES = new Set(['bottom-start']);

const CLASS_LIST = /^[\w:/[\]().%,!&=*>_-]+( [\w:/[\]().%,!&=*>_-]+)*$/;

/**
 * Class names written out as complete string literals or static class attributes: the ones a
 * Tailwind scan can see. Object keys (`'top-start': ...`) are not classes.
 */
function literalClasses(source: string): string[] {
  const classes = new Set<string>();
  for (const [, literal] of source.matchAll(/'([^'\n]*)'(?!\s*:)/g)) {
    if (CLASS_LIST.test(literal) && literal.includes('-')) {
      for (const name of literal.split(' ')) classes.add(name);
    }
  }
  for (const [, attribute] of source.matchAll(/\sclass="([^"{}]*)"/g)) {
    for (const name of attribute.split(/\s+/).filter(Boolean)) classes.add(name);
  }
  return [...classes];
}

/** Every token of a file, the way Tailwind's scanner reads it. */
function allTokens(source: string): string[] {
  return source.split(/[\s'"`{}<>=;,]+/).filter(Boolean);
}

function escapeSelector(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

describe('Tailwind class emission for the ui primitives', () => {
  let css = '';

  beforeAll(async () => {
    const appCss = fs.readFileSync(path.resolve('src/app.css'), 'utf-8');
    const compiler = await compile(appCss, {
      base: path.resolve('src'),
      onDependency: () => {}
    });
    const candidates = SOURCES.flatMap((file) =>
      allTokens(fs.readFileSync(path.join(UI_DIR, file), 'utf-8'))
    );
    css = compiler.build(candidates);
  });

  it('emits every class that the variant, size and surface maps spell out', () => {
    const missing: string[] = [];
    for (const file of [
      'Button.svelte',
      'Panel.svelte',
      'MenuItem.svelte',
      'Select.svelte',
      'TextField.svelte',
      'Label.svelte',
      'Menu.svelte'
    ]) {
      const classes = literalClasses(fs.readFileSync(path.join(UI_DIR, file), 'utf-8'));
      expect(classes.length, file).toBeGreaterThan(3);
      for (const name of classes) {
        if (NOT_UTILITIES.has(name) || name.startsWith('[')) continue;
        if (!css.includes(`.${escapeSelector(name)}`)) missing.push(`${file}: ${name}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('emits the design tokens the primitives rely on', () => {
    for (const name of [
      'border-line-strong',
      'shadow-float',
      'shadow-modal',
      'shadow-glow-primary',
      'z-dropdown',
      'z-modal',
      'rounded-md'
    ]) {
      expect(css, name).toContain(`.${escapeSelector(name)}`);
    }
  });
});
