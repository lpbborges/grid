import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ErrorNotice from './ErrorNotice.svelte';

describe('ErrorNotice', () => {
  it.each([
    ['reload', 'Tentar novamente'],
    ['retry', 'Tentar novamente'],
    ['otherSource', 'Tentar outra fonte'],
    ['back', 'Voltar']
  ] as const)('offers one %s button', async (action, label) => {
    const onaction = vi.fn();
    render(ErrorNotice, { error: { message: 'Algo deu errado.', action }, onaction });

    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado.');
    await fireEvent.click(screen.getByRole('button', { name: label }));

    expect(onaction).toHaveBeenCalledWith(action);
  });
});
