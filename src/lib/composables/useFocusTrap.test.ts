import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import FocusTrapHarness from './__fixtures__/FocusTrapHarness.svelte';

const button = (name: string) => screen.getByRole('button', { name });
const tab = (shiftKey = false) =>
  fireEvent.keyDown(document.activeElement as Element, { key: 'Tab', shiftKey });

async function activate(props = {}) {
  render(FocusTrapHarness, props);
  button('open').focus();
  await fireEvent.click(button('open'));
}

describe('useFocusTrap', () => {
  it('moves focus to the first focusable element', async () => {
    await activate();

    expect(button('first')).toHaveFocus();
  });

  it('prefers the element marked data-autofocus', async () => {
    await activate({ withAutofocus: true });

    expect(button('second')).toHaveFocus();
  });

  it('wraps Tab from the last to the first and Shift+Tab the other way', async () => {
    await activate();
    button('last').focus();

    await tab();
    expect(button('first')).toHaveFocus();

    await tab(true);
    expect(button('last')).toHaveFocus();
  });

  it('pulls focus back when it is outside the trap', async () => {
    await activate();
    button('release').focus();

    await tab();

    expect(button('first')).toHaveFocus();
  });

  it('gives focus back to what had it before, when released', async () => {
    await activate();

    await fireEvent.click(button('release'));

    expect(button('open')).toHaveFocus();
  });

  it('leaves Tab alone while inactive', async () => {
    render(FocusTrapHarness);
    button('release').focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });

    button('release').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
