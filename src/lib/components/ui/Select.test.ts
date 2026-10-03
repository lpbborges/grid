import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { axe } from 'vitest-axe';
import Select from './Select.svelte';

const options = [
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p', disabled: true }
];

describe('Select', () => {
  it('is a native select named by its visible label', () => {
    render(Select, { label: 'Qualidade', options, value: '720p' });

    const select = screen.getByRole('combobox', { name: 'Qualidade' });
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveValue('720p');
  });

  it('renders every option, keeping disabled ones disabled', () => {
    render(Select, { label: 'Qualidade', options, value: '1080p' });

    expect(screen.getAllByRole('option').map((o) => o.textContent?.trim())).toEqual([
      '1080p',
      '720p',
      '480p'
    ]);
    expect(screen.getByRole('option', { name: '480p' })).toBeDisabled();
  });

  it('reports the chosen value', async () => {
    const onchange = vi.fn();
    render(Select, { label: 'Qualidade', options, value: '1080p', onchange });

    await fireEvent.change(screen.getByRole('combobox'), { target: { value: '720p' } });

    expect(onchange).toHaveBeenCalledExactlyOnceWith('720p');
  });

  it('takes the label from aria-label when the visible one is hidden', () => {
    const { container } = render(Select, {
      label: 'Qualidade',
      options,
      value: '1080p',
      showLabel: false
    });

    expect(screen.getByRole('combobox', { name: 'Qualidade' })).toBeInTheDocument();
    expect(container.querySelector('label')).toBeNull();
  });

  it('keeps the field on its own relative wrapper so the chevron needs no offsets', () => {
    const { container } = render(Select, { label: 'Qualidade', options, value: '1080p' });
    const wrapper = container.querySelector('select')!.parentElement!;

    expect(wrapper).toHaveClass('relative');
    expect(wrapper.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is 40px tall by default, 32px when small, and mono only on request', () => {
    const { unmount } = render(Select, { label: 'a', options, value: '1080p' });
    expect(screen.getByRole('combobox')).toHaveClass('h-10', 'text-sm');
    expect(screen.getByRole('combobox')).not.toHaveClass('font-mono');
    unmount();

    render(Select, { label: 'a', options, value: '1080p', size: 'sm', mono: true });
    expect(screen.getByRole('combobox')).toHaveClass('h-8', 'font-mono');
  });

  it('shows the green focus ring and no border-only focus', () => {
    render(Select, { label: 'a', options, value: '1080p' });

    expect(screen.getByRole('combobox')).toHaveClass(
      'focus-visible:ring-2',
      'focus-visible:ring-green'
    );
  });

  it('flags an error through aria-invalid and a described alert', () => {
    render(Select, { label: 'a', options, value: '1080p', error: 'Escolha uma opção' });
    const select = screen.getByRole('combobox');

    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Escolha uma opção');
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha uma opção');
  });

  it('disables', () => {
    render(Select, { label: 'a', options, value: '1080p', disabled: true });

    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('gives each instance its own id', () => {
    render(Select, { label: 'A', options, value: '1080p' });
    render(Select, { label: 'B', options, value: '1080p' });

    const [a, b] = screen.getAllByRole('combobox');
    expect(a.id).not.toBe(b.id);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(Select, { label: 'Qualidade', options, value: '1080p' });

    expect(await axe(container)).toHaveNoViolations();
  });
});
