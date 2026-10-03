import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import LoadingIndicator from './LoadingIndicator.svelte';

describe('LoadingIndicator', () => {
  it('announces its label once as a status', () => {
    render(LoadingIndicator, { label: 'Carregando...' });

    expect(screen.getByRole('status')).toHaveTextContent('Carregando...');
  });
});
