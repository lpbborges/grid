import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DisclaimerModal, { DISCLAIMER_TEXT } from './DisclaimerModal.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';

describe('DisclaimerModal', () => {
  beforeEach(() => {
    localStorage.clear();
    settingsStore.acceptedDisclaimer = false;
  });

  it('is an alert dialog that names itself and carries the notice', () => {
    render(DisclaimerModal);

    const dialog = screen.getByRole('alertdialog', { name: 'Bem-vindo ao Grid' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(DISCLAIMER_TEXT);
  });

  it('puts focus on Entendi', async () => {
    render(DisclaimerModal);

    await screen.findByRole('button', { name: 'Entendi' });

    expect(screen.getByRole('button', { name: 'Entendi' })).toHaveFocus();
  });

  it('cannot be dismissed without accepting', async () => {
    render(DisclaimerModal);

    await fireEvent.keyDown(window, { key: 'Escape' });
    await fireEvent.click(screen.getByRole('presentation'));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(settingsStore.acceptedDisclaimer).toBe(false);
  });

  it('is accepted with Entendi, remembered, and goes away', async () => {
    render(DisclaimerModal);

    await fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));

    expect(settingsStore.acceptedDisclaimer).toBe(true);
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('does not show once accepted', () => {
    settingsStore.acceptedDisclaimer = true;
    render(DisclaimerModal);

    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
