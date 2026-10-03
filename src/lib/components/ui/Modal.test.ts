import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { axe } from 'vitest-axe';
import ModalHarness from './__fixtures__/ModalHarness.svelte';

const opener = () => screen.getByRole('button', { name: 'Abrir' });

async function openModal(props = {}) {
  const view = render(ModalHarness, props);
  opener().focus();
  await fireEvent.click(opener());
  return view;
}

describe('Modal', () => {
  it('renders nothing while closed', () => {
    render(ModalHarness);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a labelled, described, modal dialog', async () => {
    await openModal();
    const dialog = screen.getByRole('dialog', { name: 'Aviso' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Leia com atenção.');
  });

  it('can be an alertdialog', async () => {
    await openModal({ role: 'alertdialog' });

    expect(screen.getByRole('alertdialog', { name: 'Aviso' })).toBeInTheDocument();
  });

  it('moves focus to the element marked data-autofocus', async () => {
    await openModal();

    expect(screen.getByRole('button', { name: 'Entendi' })).toHaveFocus();
  });

  it('traps Tab inside and gives focus back to the opener when it closes', async () => {
    await openModal();
    screen.getByRole('button', { name: 'Outro' }).focus();

    await fireEvent.keyDown(document.activeElement as Element, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Entendi' })).toHaveFocus();

    await fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    await vi.waitFor(() => expect(opener()).toHaveFocus());
  });

  it('makes the page behind inert but leaves the window controls usable', async () => {
    await openModal();

    expect(screen.getByTestId('app')).toHaveAttribute('inert');
    expect(screen.getByTestId('titlebar')).not.toHaveAttribute('inert');
  });

  it('locks page scroll while open and releases it after', async () => {
    await openModal();
    expect(document.body.style.overflow).toBe('hidden');

    await fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));

    expect(document.body.style.overflow).not.toBe('hidden');
    expect(screen.getByTestId('app')).not.toHaveAttribute('inert');
  });

  it('closes on Escape and on a backdrop click when dismissible', async () => {
    const onclose = vi.fn();
    await openModal({ onclose });

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledTimes(1);

    await fireEvent.click(opener());
    await fireEvent.click(screen.getByRole('presentation'));
    expect(onclose).toHaveBeenCalledTimes(2);
  });

  it('ignores clicks inside the card', async () => {
    const onclose = vi.fn();
    await openModal({ onclose });

    await fireEvent.click(screen.getByRole('dialog'));

    expect(onclose).not.toHaveBeenCalled();
  });

  it('cannot be dismissed with Escape or the backdrop when not dismissible', async () => {
    const onclose = vi.fn();
    await openModal({ dismissible: false, role: 'alertdialog', onclose });

    await fireEvent.keyDown(window, { key: 'Escape' });
    await fireEvent.click(screen.getByRole('presentation'));

    expect(onclose).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('floats above the page on the modal layer with the large radius', async () => {
    await openModal();

    expect(screen.getByRole('presentation')).toHaveClass('z-modal', 'fixed', 'inset-0');
    expect(screen.getByRole('dialog')).toHaveClass('rounded-md', 'shadow-modal', 'p-8');
  });

  it('has no accessibility violations', async () => {
    const { container } = await openModal();

    expect(await axe(container)).toHaveNoViolations();
  });
});
