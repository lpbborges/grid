import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { axe } from 'vitest-axe';
import TextField from './TextField.svelte';

const snippet = (html: string) => createRawSnippet(() => ({ render: () => html }));

describe('TextField', () => {
  it('is a text input named by its label', () => {
    render(TextField, { label: 'Nome da lista' });

    expect(screen.getByRole('textbox', { name: 'Nome da lista' })).toBeInTheDocument();
  });

  it('can be named with aria-label alone', () => {
    const { container } = render(TextField, { 'aria-label': 'Pesquisar', type: 'search' });

    expect(screen.getByRole('searchbox', { name: 'Pesquisar' })).toBeInTheDocument();
    expect(container.querySelector('label')).toBeNull();
  });

  it('forwards input attributes and events', async () => {
    const oninput = vi.fn();
    render(TextField, { 'aria-label': 'x', placeholder: 'Nome', maxlength: 5, oninput });
    const input = screen.getByRole('textbox');

    await fireEvent.input(input, { target: { value: 'abc' } });

    expect(input).toHaveAttribute('placeholder', 'Nome');
    expect(input).toHaveAttribute('maxlength', '5');
    expect(oninput).toHaveBeenCalledOnce();
  });

  it('starts from the given value', () => {
    render(TextField, { 'aria-label': 'x', value: 'Cinema' });

    expect(screen.getByRole('textbox')).toHaveValue('Cinema');
  });

  it('describes the field by its hint', () => {
    render(TextField, { label: 'Nome', hint: 'Até 40 caracteres' });

    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('Até 40 caracteres');
  });

  it('flags an error with aria-invalid, an alert and a red border', () => {
    render(TextField, { label: 'Nome', error: 'Nome obrigatório', hint: 'dica' });
    const input = screen.getByRole('textbox');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Nome obrigatório dica');
    expect(screen.getByRole('alert')).toHaveTextContent('Nome obrigatório');
    expect(input.parentElement).toHaveClass('border-error');
  });

  it('puts the focus ring on the whole field, so icons and buttons sit inside it', () => {
    render(TextField, {
      'aria-label': 'x',
      leading: snippet('<svg data-testid="lead"></svg>'),
      trailing: snippet('<span data-testid="trail">x</span>')
    });
    const field = screen.getByRole('textbox').parentElement!;

    expect(field).toContainElement(screen.getByTestId('lead'));
    expect(field).toContainElement(screen.getByTestId('trail'));
    expect(field.className).toContain('has-[:focus-visible]:ring-2');
    expect(field.className).toContain('has-[:focus-visible]:ring-green');
  });

  it('draws one focus edge: the ring sits on the border, without an offset gap', () => {
    render(TextField, { 'aria-label': 'x' });
    const field = screen.getByRole('textbox').parentElement!;

    expect(field.className).not.toContain('ring-offset');
  });

  it('hides the native search clear button, since callers render their own', () => {
    render(TextField, { 'aria-label': 'x', type: 'search' });

    expect(screen.getByRole('searchbox')).toHaveClass('[&::-webkit-search-cancel-button]:hidden');
  });

  it('uses the dark background in panels and the translucent surface on the page', () => {
    const { unmount } = render(TextField, { 'aria-label': 'x' });
    expect(screen.getByRole('textbox').parentElement).toHaveClass('bg-dark');
    unmount();

    render(TextField, { 'aria-label': 'x', surface: 'page', glow: true });
    expect(screen.getByRole('textbox').parentElement).toHaveClass(
      'bg-surface/90',
      'shadow-glow-green'
    );
  });

  it('is 32px, 40px by size and disables', () => {
    const { unmount } = render(TextField, { 'aria-label': 'x', size: 'sm' });
    expect(screen.getByRole('textbox').parentElement).toHaveClass('h-8');
    unmount();

    render(TextField, { 'aria-label': 'x', disabled: true });
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(TextField, { label: 'Nome', hint: 'dica' });

    expect(await axe(container)).toHaveNoViolations();
  });
});
