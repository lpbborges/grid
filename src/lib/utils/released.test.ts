import { describe, it, expect } from 'vitest';
import { isReleased } from './released';

const now = new Date('2026-10-02T12:00:00Z');

describe('isReleased', () => {
  it('counts a past release date as released', () => {
    expect(isReleased({ releaseDate: '2026-09-23T00:00:00.000Z', year: 2026 }, now)).toBe(true);
  });

  it('counts today as released', () => {
    expect(isReleased({ releaseDate: '2026-10-02T00:00:00.000Z', year: 2026 }, now)).toBe(true);
  });

  it('does not count a future release date as released', () => {
    expect(isReleased({ releaseDate: '2026-12-02T00:00:00.000Z', year: 2026 }, now)).toBe(false);
  });

  it('trusts the date over the year', () => {
    expect(isReleased({ releaseDate: '2027-01-01T00:00:00.000Z', year: 2020 }, now)).toBe(false);
  });

  it('falls back to the year when the date is not a date', () => {
    expect(isReleased({ releaseDate: 'soon', year: 2020 }, now)).toBe(true);
    expect(isReleased({ releaseDate: 'soon', year: 2026 }, now)).toBe(false);
  });

  it('counts a year before the current one as released when there is no date', () => {
    expect(isReleased({ year: 2025 }, now)).toBe(true);
  });

  it('drops a title from the current or a later year without a date', () => {
    expect(isReleased({ year: 2026 }, now)).toBe(false);
    expect(isReleased({ year: 2027 }, now)).toBe(false);
  });

  it('drops a title without a date or a year', () => {
    expect(isReleased({ year: 0 }, now)).toBe(false);
  });
});
