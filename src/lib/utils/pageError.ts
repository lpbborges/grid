/** What the single button under an error offers. */
export type ErrorAction = 'reload' | 'retry' | 'otherSource' | 'back';

export interface PageError {
  message: string;
  action: ErrorAction;
}

export const ERROR_ACTION_LABELS: Record<ErrorAction, string> = {
  reload: 'Tentar novamente',
  retry: 'Tentar novamente',
  otherSource: 'Tentar outra fonte',
  back: 'Voltar'
};
