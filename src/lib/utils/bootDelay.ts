const STEP_MS = 40;
const MAX_STEPS = 11;

export const bootDelay = (index: number) =>
  `animation-delay: ${Math.min(index, MAX_STEPS) * STEP_MS}ms`;
