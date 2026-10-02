import { describe, it, expect } from 'vitest';
import { findIntro } from './intro';

describe('findIntro', () => {
  it('spans the intro chapter up to the next one', () => {
    expect(
      findIntro([
        { title: 'Prologue', time: 0 },
        { title: 'Opening', time: 95 },
        { title: 'Part A', time: 185 }
      ])
    ).toEqual({ start: 95, end: 185 });
  });

  it.each(['Intro', 'OP', 'OP1', 'Opening Credits', 'Abertura', ' opening '])(
    'recognises a chapter named %s',
    (title) => {
      expect(
        findIntro([
          { title, time: 0 },
          { title: null, time: 80 }
        ])
      ).toEqual({
        start: 0,
        end: 80
      });
    }
  );

  it('knows nothing without a named intro chapter', () => {
    expect(findIntro([])).toBeNull();
    expect(
      findIntro([
        { title: 'Chapter 1', time: 0 },
        { title: 'Chapter 2', time: 90 }
      ])
    ).toBeNull();
    expect(
      findIntro([
        { title: null, time: 0 },
        { title: null, time: 90 }
      ])
    ).toBeNull();
  });

  it('never guesses where an intro without a following chapter ends', () => {
    expect(findIntro([{ title: 'Opening', time: 0 }])).toBeNull();
  });

  it('distrusts an intro chapter longer than any real opening', () => {
    expect(
      findIntro([
        { title: 'Intro', time: 0 },
        { title: 'Main', time: 1200 }
      ])
    ).toBeNull();
  });
});
