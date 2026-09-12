import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import EmptyState from './EmptyState.svelte';
import '@testing-library/jest-dom';

describe('EmptyState component', () => {
  it('renders the provided message', () => {
    const { getByText } = render(EmptyState, {
      props: { message: 'Nenhuma opção de reprodução disponível' }
    });

    expect(getByText('Nenhuma opção de reprodução disponível')).toBeInTheDocument();
  });
});
