import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DismissableHarness from './__fixtures__/DismissableHarness.svelte';

const toggle = () => fireEvent.click(screen.getByRole('button', { name: 'trigger' }));

describe('useDismissable', () => {
  it('stays open for the click that opened it', async () => {
    const onclose = vi.fn();
    render(DismissableHarness, { onclose });

    await toggle();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onclose).not.toHaveBeenCalled();
  });

  it('ignores clicks inside the panel', async () => {
    const onclose = vi.fn();
    render(DismissableHarness, { onclose });
    await toggle();

    await fireEvent.click(screen.getByRole('button', { name: 'inside' }));

    expect(onclose).not.toHaveBeenCalled();
  });

  it('counts a target that its own click removes as inside', async () => {
    const onclose = vi.fn();
    render(DismissableHarness, { onclose });
    await toggle();

    await fireEvent.click(screen.getByRole('button', { name: 'vanishing' }));

    expect(onclose).not.toHaveBeenCalled();
  });

  it('closes on a click outside', async () => {
    const onclose = vi.fn();
    render(DismissableHarness, { onclose });
    await toggle();

    await fireEvent.click(screen.getByRole('button', { name: 'outside' }));

    expect(onclose).toHaveBeenCalledExactlyOnceWith('outside');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape', async () => {
    const onclose = vi.fn();
    render(DismissableHarness, { onclose });
    await toggle();

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(onclose).toHaveBeenCalledExactlyOnceWith('escape');
  });

  it('ignores other keys', async () => {
    const onclose = vi.fn();
    render(DismissableHarness, { onclose });
    await toggle();

    await fireEvent.keyDown(window, { key: 'Enter' });

    expect(onclose).not.toHaveBeenCalled();
  });

  it('listens only while open', async () => {
    const onclose = vi.fn();
    render(DismissableHarness, { onclose });

    await fireEvent.keyDown(window, { key: 'Escape' });
    await fireEvent.click(screen.getByRole('button', { name: 'outside' }));

    expect(onclose).not.toHaveBeenCalled();
  });

  it('stops listening once closed and after unmount', async () => {
    const onclose = vi.fn();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(DismissableHarness, { onclose });
    await toggle();
    await fireEvent.keyDown(window, { key: 'Escape' });
    onclose.mockClear();

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).not.toHaveBeenCalled();

    await toggle();
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('judges a click by its composed path, so shadow content counts as inside', async () => {
    const onclose = vi.fn();
    render(DismissableHarness, { onclose });
    await toggle();
    const host = document.createElement('div');
    screen.getByRole('dialog').append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('button');
    shadow.append(inner);

    await fireEvent.click(inner, { composed: true });

    expect(onclose).not.toHaveBeenCalled();
  });
});
