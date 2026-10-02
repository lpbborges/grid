import { describe, it, expect } from 'vitest';
import { LOADING_STAGES, loadingStageLabel, loadingStageProgress } from './loadingStage';

describe('loading stages', () => {
  it('names every stage in plain words', () => {
    expect(LOADING_STAGES.map(loadingStageLabel)).toEqual([
      'Procurando o melhor vídeo…',
      'Ainda procurando, só mais um pouco…',
      'Preparando vídeo…',
      'Quase pronto…'
    ]);
  });

  it('advances the progress with every stage', () => {
    expect(LOADING_STAGES.map(loadingStageProgress)).toEqual([25, 40, 65, 90]);
  });
});
