export const LOADING_STAGES = ['searching', 'searchingSlow', 'preparing', 'loading'] as const;

export type LoadingStage = (typeof LOADING_STAGES)[number];

const STAGES: Record<LoadingStage, { label: string; progress: number }> = {
  searching: { label: 'Procurando o melhor vídeo…', progress: 25 },
  searchingSlow: { label: 'Ainda procurando, só mais um pouco…', progress: 40 },
  preparing: { label: 'Preparando vídeo…', progress: 65 },
  loading: { label: 'Quase pronto…', progress: 90 }
};

export function loadingStageLabel(stage: LoadingStage): string {
  return STAGES[stage].label;
}

export function loadingStageProgress(stage: LoadingStage): number {
  return STAGES[stage].progress;
}

/** How long the last stage may wait for the first frame before the viewer is told it is slow. */
export const SLOW_START_MS = 20_000;
