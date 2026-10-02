import type { CardMedia, MediaType } from '$lib/types';
import { playerState } from '$lib/stores.svelte';
import { settingsStore } from './settings.svelte';

export const HOVER_DELAY_MS = 600;
export const LEAVE_GRACE_MS = 120;
export const SCROLL_QUIET_MS = 200;

export interface ActivePreview {
  el: HTMLElement;
  media: CardMedia;
  type: MediaType;
  /** Set when the title sits in Continuar assistindo, to offer removing it from there. */
  onremove?: () => void;
  /** Where the card links to, when that is not the title's page (e.g. the episode to resume). */
  href?: string;
  progress?: { time: number; duration: number };
  episodeLabel?: string;
  upNext?: boolean;
}

export type PreviewRowContext = Pick<
  ActivePreview,
  'href' | 'onremove' | 'progress' | 'episodeLabel' | 'upNext'
>;

class HoverPreviewStore {
  active = $state<ActivePreview | null>(null);
  /** Set by `HoverPreview` so a card can hand keyboard focus to the open preview. */
  panel: HTMLElement | undefined;
  #pending: ActivePreview | null = null;
  #openTimer: ReturnType<typeof setTimeout> | undefined;
  #closeTimer: ReturnType<typeof setTimeout> | undefined;
  #scrollingUntil = 0;

  #allowed(): boolean {
    return (
      settingsStore.hoverPreview && !playerState.isPlaying && Date.now() >= this.#scrollingUntil
    );
  }

  request(el: HTMLElement, media: CardMedia, type: MediaType, row: PreviewRowContext = {}) {
    this.keep();
    clearTimeout(this.#openTimer);
    this.#pending = null;
    if (this.active?.el === el) return;
    this.active = null;
    if (!this.#allowed()) return;
    this.#pending = { el, media, type, ...row };
    this.#openTimer = setTimeout(() => {
      const pending = this.#pending;
      this.#pending = null;
      if (pending && this.#allowed()) this.active = pending;
    }, HOVER_DELAY_MS);
  }

  /** The pointer or focus left `el`; an open preview closes after a short grace. */
  leave(el: HTMLElement) {
    if (this.#pending?.el === el) {
      clearTimeout(this.#openTimer);
      this.#pending = null;
    }
    if (this.active?.el !== el) return;
    clearTimeout(this.#closeTimer);
    this.#closeTimer = setTimeout(() => this.close(), LEAVE_GRACE_MS);
  }

  /** The pointer reached the preview itself, so it must not close. */
  keep() {
    clearTimeout(this.#closeTimer);
  }

  close() {
    clearTimeout(this.#openTimer);
    clearTimeout(this.#closeTimer);
    this.#pending = null;
    this.active = null;
  }

  /** Moves keyboard focus into the open preview; false when none is open. */
  focusActions(): boolean {
    const first = this.panel?.querySelector<HTMLElement>('a[href]:not([tabindex="-1"]), button');
    first?.focus();
    return Boolean(first);
  }

  noteScroll() {
    this.close();
    this.#scrollingUntil = Date.now() + SCROLL_QUIET_MS;
  }
}

export const hoverPreview = new HoverPreviewStore();
