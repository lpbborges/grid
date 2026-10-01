import '@testing-library/jest-dom/vitest';

// jsdom has no element scrolling; give spies something to wrap.
if (typeof HTMLElement !== 'undefined') {
  HTMLElement.prototype.scrollTo ??= () => {};
  HTMLElement.prototype.scrollIntoView ??= () => {};
}
