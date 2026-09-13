import { render, within } from '@testing-library/svelte';
import { describe, it, expect, beforeEach } from 'vitest';
import PreferenceSelectors from './PreferenceSelectors.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';
import '@testing-library/jest-dom';

describe('PreferenceSelectors component', () => {
  beforeEach(() => {
    settingsStore.audio = 'original';
    settingsStore.subtitle = 'none';
  });

  it('renders the "Original" option with the resolved language name in a single, consistent format', () => {
    const { getByText } = render(PreferenceSelectors, {
      props: { originalLanguage: 'en' }
    });

    expect(getByText('Original (Inglês)')).toBeInTheDocument();
  });

  it('renders a bare "Original" label when there is no known original language', () => {
    const { getByText } = render(PreferenceSelectors, {
      props: { originalLanguage: undefined }
    });

    expect(getByText('Original')).toBeInTheDocument();
  });

  it('omits the audio option matching the original language', () => {
    const { getByLabelText } = render(PreferenceSelectors, {
      props: { originalLanguage: 'en' }
    });

    const audioSelect = getByLabelText('Áudio') as HTMLSelectElement;
    const optionValues = Array.from(audioSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(['original', 'pt', 'es']);
    expect(within(audioSelect).queryByText('Inglês')).not.toBeInTheDocument();
  });

  it('shows the "Original" option when the stored audio preference is the original language', () => {
    settingsStore.audio = 'pt';
    const { getByLabelText } = render(PreferenceSelectors, {
      props: { originalLanguage: 'pt' }
    });

    const audioSelect = getByLabelText('Áudio') as HTMLSelectElement;
    expect(audioSelect.value).toBe('original');
    expect(audioSelect.selectedOptions[0].textContent).toBe('Original (Português)');
  });

  it('renders all four subtitle options regardless of original language', () => {
    const { getByLabelText } = render(PreferenceSelectors, {
      props: { originalLanguage: 'en' }
    });

    const subtitleSelect = getByLabelText('Legenda') as HTMLSelectElement;
    const optionValues = Array.from(subtitleSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(['none', 'pt', 'en', 'es']);
  });

  it('uses distinct ids for the audio and subtitle selects across multiple instances', () => {
    const { container: firstContainer } = render(PreferenceSelectors, {
      props: { originalLanguage: 'en' }
    });
    const { container: secondContainer } = render(PreferenceSelectors, {
      props: { originalLanguage: 'en' }
    });

    const firstAudio = within(firstContainer).getByLabelText('Áudio') as HTMLSelectElement;
    const secondAudio = within(secondContainer).getByLabelText('Áudio') as HTMLSelectElement;
    expect(firstAudio.id).not.toBe(secondAudio.id);
  });
});
