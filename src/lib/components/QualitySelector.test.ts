import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import QualitySelector from './QualitySelector.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';

describe('QualitySelector', () => {
  beforeEach(() => {
    localStorage.clear();
    settingsStore.quality = '1080p';
  });

  it('offers the four qualities, on the stored one', () => {
    render(QualitySelector);

    const select = screen.getByRole('combobox', { name: 'Qualidade' });
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.value)).toEqual([
      '4k',
      '1080p',
      '720p',
      '480p'
    ]);
    expect(select).toHaveValue('1080p');
  });

  it('stores the quality that was picked', async () => {
    render(QualitySelector);

    await fireEvent.change(screen.getByRole('combobox'), { target: { value: '720p' } });

    expect(settingsStore.quality).toBe('720p');
  });

  it('keeps an accessible name when the visible label is hidden', () => {
    const { container } = render(QualitySelector, { showLabel: false, size: 'compact' });

    expect(screen.getByRole('combobox', { name: 'Qualidade' })).toHaveClass('h-8');
    expect(container.querySelector('label')).toBeNull();
  });

  it('puts the wrapper class on the field for layout', () => {
    const { container } = render(QualitySelector, { wrapperClass: 'col-span-2' });

    expect(container.firstElementChild).toHaveClass('col-span-2');
  });
});
