import { beforeEach, describe, expect, it } from 'vitest';
import {
  AI_TRAINING_PLAN_CACHE_KEY,
  loadCachedTrainingPlan,
  saveCachedTrainingPlan,
  trainingPlanGenerationKey,
} from './aiTrainingPlan.js';
import { clearStorageMemoryFallback } from './safeStorage.js';

describe('AI training plan cache', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStorageMemoryFallback();
  });

  it('uses factual dossier changes as the generation boundary', () => {
    const a = trainingPlanGenerationKey({ facts: { sample_band: '10-19', priorities: [{ title: 'A' }] } });
    const b = trainingPlanGenerationKey({ facts: { sample_band: '10-19', priorities: [{ title: 'B' }] } });
    expect(a).not.toBe(b);
  });

  it('never reuses a plan across authenticated identities', () => {
    const key = trainingPlanGenerationKey({ facts: { priorities: [{ title: 'A' }] } });
    expect(saveCachedTrainingPlan(key, 'Entrena A y luego B.', 'alice')).toBe(true);
    expect(loadCachedTrainingPlan(key, 'alice')).toBe('Entrena A y luego B.');
    expect(loadCachedTrainingPlan(key, 'bob')).toBeNull();
    expect(localStorage.getItem(AI_TRAINING_PLAN_CACHE_KEY)).toContain('alice');
  });
});
