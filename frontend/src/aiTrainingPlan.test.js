import { beforeEach, describe, expect, it } from 'vitest';
import {
  AI_TRAINING_PLAN_CACHE_KEY,
  loadCachedTrainingPlan,
  markTrainingPlanManualRefresh,
  saveCachedTrainingPlan,
  shouldCommitManualTrainingPlanRefresh,
  trainingPlanGenerationKey,
  trainingPlanManualRefreshState,
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
  it('aplica 6 h de cooldown manual por identidad y admin puede saltarlo', () => {
    const now = 1_000_000;
    expect(trainingPlanManualRefreshState({ now, identityScope: 'alice' }).allowed).toBe(true);
    expect(markTrainingPlanManualRefresh({ now, identityScope: 'alice' })).toBe(true);
    const blocked = trainingPlanManualRefreshState({ now: now + 1000, identityScope: 'alice' });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(5 * 60 * 60 * 1000);
    expect(trainingPlanManualRefreshState({ now: now + 1000, identityScope: 'bob' }).allowed).toBe(true);
    expect(trainingPlanManualRefreshState({ now: now + 1000, identityScope: 'alice', bypassCooldown: true }).allowed).toBe(true);
  });

  it('sólo consume cooldown local cuando una lectura manual devolvió texto', () => {
    expect(shouldCommitManualTrainingPlanRefresh('training_plan_manual', 'Plan nuevo')).toBe(true);
    expect(shouldCommitManualTrainingPlanRefresh('training_plan_manual', '')).toBe(false);
    expect(shouldCommitManualTrainingPlanRefresh('training_plan', 'Plan automático')).toBe(false);
  });

});
