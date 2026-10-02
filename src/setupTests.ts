import '@testing-library/jest-dom/vitest';

// jsdom has no element scrolling; give spies something to wrap.
if (typeof HTMLElement !== 'undefined') {
  HTMLElement.prototype.scrollTo ??= () => {};
  HTMLElement.prototype.scrollIntoView ??= () => {};
}

// jsdom has no Web Animations; let Svelte transitions finish on the next microtask.
if (typeof HTMLElement !== 'undefined' && !('animate' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value() {
      let handler: (() => void) | null = null;
      return {
        currentTime: 0,
        finished: Promise.resolve(),
        cancel() {},
        finish() {},
        pause() {},
        play() {},
        addEventListener() {},
        removeEventListener() {},
        get onfinish() {
          return handler;
        },
        set onfinish(fn: (() => void) | null) {
          handler = fn;
          if (fn) queueMicrotask(fn);
        }
      };
    }
  });
}
