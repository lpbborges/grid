import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hoverPreview,
  HOVER_DELAY_MS,
  LEAVE_GRACE_MS,
  SCROLL_QUIET_MS
} from './hoverPreview.svelte';
import { settingsStore } from './settings.svelte';
import { playerState } from '$lib/stores.svelte';

const movie = { id: 'tt1', title: 'Um', medium_cover_image: 'a.jpg' };
const other = { id: 'tt2', title: 'Dois', medium_cover_image: 'b.jpg' };

describe('hoverPreview', () => {
  let card: HTMLElement;
  let otherCard: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    card = document.createElement('a');
    otherCard = document.createElement('a');
    settingsStore.hoverPreview = true;
    playerState.isPlaying = false;
  });

  afterEach(() => {
    hoverPreview.close();
    vi.useRealTimers();
  });

  it('opens only after the hover delay', () => {
    hoverPreview.request(card, movie, 'movie');

    vi.advanceTimersByTime(HOVER_DELAY_MS - 1);
    expect(hoverPreview.active).toBeNull();

    vi.advanceTimersByTime(1);
    expect(hoverPreview.active).toMatchObject({ el: card, media: movie, type: 'movie' });
  });

  it('never opens when the pointer leaves before the delay', () => {
    hoverPreview.request(card, movie, 'movie');
    hoverPreview.leave(card);

    vi.advanceTimersByTime(HOVER_DELAY_MS * 2);

    expect(hoverPreview.active).toBeNull();
  });

  it('closes shortly after the pointer leaves an open card', () => {
    hoverPreview.request(card, movie, 'movie');
    vi.advanceTimersByTime(HOVER_DELAY_MS);

    hoverPreview.leave(card);
    expect(hoverPreview.active).not.toBeNull();
    vi.advanceTimersByTime(LEAVE_GRACE_MS);

    expect(hoverPreview.active).toBeNull();
  });

  it('stays open when the pointer moves onto the preview', () => {
    hoverPreview.request(card, movie, 'movie');
    vi.advanceTimersByTime(HOVER_DELAY_MS);

    hoverPreview.leave(card);
    hoverPreview.keep();
    vi.advanceTimersByTime(LEAVE_GRACE_MS * 3);

    expect(hoverPreview.active).not.toBeNull();
  });

  it('shows one preview at a time', () => {
    hoverPreview.request(card, movie, 'movie');
    vi.advanceTimersByTime(HOVER_DELAY_MS);
    hoverPreview.request(otherCard, other, 'series');

    expect(hoverPreview.active).toBeNull();
    vi.advanceTimersByTime(HOVER_DELAY_MS);
    expect(hoverPreview.active).toMatchObject({ el: otherCard, media: other, type: 'series' });
  });

  it('ignores a leave from a card that is not the pending one', () => {
    hoverPreview.request(card, movie, 'movie');
    hoverPreview.leave(otherCard);

    vi.advanceTimersByTime(HOVER_DELAY_MS);

    expect(hoverPreview.active).toMatchObject({ el: card });
  });

  it('does not open while the player is playing', () => {
    playerState.isPlaying = true;
    hoverPreview.request(card, movie, 'movie');

    vi.advanceTimersByTime(HOVER_DELAY_MS);

    expect(hoverPreview.active).toBeNull();
  });

  it('does not open when the setting is off', () => {
    settingsStore.hoverPreview = false;
    hoverPreview.request(card, movie, 'movie');

    vi.advanceTimersByTime(HOVER_DELAY_MS);

    expect(hoverPreview.active).toBeNull();
  });

  it('does not open if playback starts during the delay', () => {
    hoverPreview.request(card, movie, 'movie');
    playerState.isPlaying = true;

    vi.advanceTimersByTime(HOVER_DELAY_MS);

    expect(hoverPreview.active).toBeNull();
  });

  it('closes on scroll and ignores requests until the scrolling settles', () => {
    hoverPreview.request(card, movie, 'movie');
    vi.advanceTimersByTime(HOVER_DELAY_MS);

    hoverPreview.noteScroll();
    expect(hoverPreview.active).toBeNull();

    hoverPreview.request(card, movie, 'movie');
    vi.advanceTimersByTime(HOVER_DELAY_MS);
    expect(hoverPreview.active).toBeNull();

    vi.advanceTimersByTime(SCROLL_QUIET_MS);
    hoverPreview.request(card, movie, 'movie');
    vi.advanceTimersByTime(HOVER_DELAY_MS);
    expect(hoverPreview.active).toMatchObject({ el: card });
  });
});
