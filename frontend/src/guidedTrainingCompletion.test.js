import { beforeEach, describe, expect, it } from 'vitest';
import {
  GUIDED_TRAINING_COMPLETION_KEY,
  clearGuidedTrainingCompletion,
  loadGuidedTrainingCompletion,
  saveGuidedTrainingCompletion,
} from './guidedTrainingCompletion.js';

const NOW = 1_800_000_000_000;

function completedSession(overrides = {}) {
  return {
    minutes: 15,
    currentIndex: 2,
    steps: [
      { id: 'debt', kind: 'debt', title: 'Ataca la deuda: mates', minutes: 8 },
      { id: 'game', kind: 'short-game', title: 'Partida corta de práctica', minutes: 6 },
      { id: 'review', kind: 'review', title: 'Cierre rápido', minutes: 1 },
    ],
    ...overrides,
  };
}

describe('guided training completion summary', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('guarda sólo bloques de práctica marcados como terminados, no convierte el cierre en progreso', () => {
    const saved = saveGuidedTrainingCompletion(completedSession(), { now: NOW });

    expect(saved).toMatchObject({
      minutes: 15,
      completedAt: NOW,
      blocks: [
        { id: 'debt', kind: 'debt', minutes: 8 },
        { id: 'game', kind: 'short-game', minutes: 6 },
      ],
    });
    expect(saved.blocks.map((block) => block.title)).toEqual([
      'Ataca la deuda: mates',
      'Partida corta de práctica',
    ]);
    expect(saved.blocks.some((block) => block.kind === 'review')).toBe(false);
    expect(loadGuidedTrainingCompletion({ now: NOW })).toEqual(saved);
  });

  it('no fabrica un resumen antes de llegar al último paso', () => {
    expect(saveGuidedTrainingCompletion(completedSession({ currentIndex: 1 }), { now: NOW })).toBeNull();
    expect(sessionStorage.getItem(GUIDED_TRAINING_COMPLETION_KEY)).toBeNull();
  });

  it('no deja que otra cuenta herede el resumen anterior', () => {
    localStorage.setItem('chess-study-auth-username', 'alice');
    expect(saveGuidedTrainingCompletion(completedSession(), { now: NOW })?.owner).toBe('alice');

    localStorage.setItem('chess-study-auth-username', 'bob');
    expect(loadGuidedTrainingCompletion({ now: NOW })).toBeNull();
    expect(sessionStorage.getItem(GUIDED_TRAINING_COMPLETION_KEY)).toBeNull();
  });

  it('caduca y puede ocultarse sin tocar el historial factual del jugador', () => {
    saveGuidedTrainingCompletion(completedSession(), { now: NOW });
    expect(loadGuidedTrainingCompletion({ now: NOW + 25 * 60 * 60 * 1000 })).toBeNull();

    saveGuidedTrainingCompletion(completedSession(), { now: NOW });
    clearGuidedTrainingCompletion();
    expect(loadGuidedTrainingCompletion({ now: NOW })).toBeNull();
  });
});
