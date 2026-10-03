import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ListNameForm from './ListNameForm.svelte';

function renderForm(props: Partial<Parameters<typeof render<typeof ListNameForm>>[1]> = {}) {
  const onsubmit = vi.fn<(name: string) => string | null>(() => null);
  render(ListNameForm, { label: 'Nome da lista', submitLabel: 'Salvar', onsubmit, ...props });
  return { onsubmit, input: screen.getByRole('textbox', { name: 'Nome da lista' }) };
}

describe('ListNameForm', () => {
  it('focuses the field and selects the current name', async () => {
    const { input } = renderForm({ value: 'Cinema' });

    await vi.waitFor(() => expect(input).toHaveFocus());
    expect((input as HTMLInputElement).selectionStart).toBe(0);
    expect((input as HTMLInputElement).selectionEnd).toBe('Cinema'.length);
  });

  it('submits what was typed with the button and with Enter', async () => {
    const { onsubmit, input } = renderForm();

    await fireEvent.input(input, { target: { value: 'Clássicos' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(onsubmit).toHaveBeenCalledTimes(2);
    expect(onsubmit).toHaveBeenCalledWith('Clássicos');
  });

  it('shows why a name was refused, ties it to the field and clears it on typing', async () => {
    const { input } = renderForm({ onsubmit: () => 'Esse nome já existe' });

    await fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Esse nome já existe');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Esse nome já existe');

    await fireEvent.input(input, { target: { value: 'Outro' } });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('cancels with the button and with Escape, only when it can be cancelled', async () => {
    const oncancel = vi.fn();
    const { input } = renderForm({ oncancel });

    await fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await fireEvent.keyDown(input, { key: 'Escape' });

    expect(oncancel).toHaveBeenCalledTimes(2);
  });

  it('has no Cancelar button without a cancel handler', () => {
    renderForm();

    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
  });
});
