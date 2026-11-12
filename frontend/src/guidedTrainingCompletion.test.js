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
      { id: 'debt', kind: 'debt', action: 'personal-filter', title: 'Ataca la deuda: mates', minutes: 8 },
      { id: 'game', kind: 'short-game', action: 'short-game', title: 'Partida corta de práctica', minutes: 6 },
      { id: 'review', kind: 'review', action: 'review', title: 'Cierre rápido', minutes: 1 },
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

  it('no acredita sesiones con un cursor corrupto o situado después del cierre', () => {
    for (const currentIndex of [-1, 3, 999, '2', 2.5, null, undefined, false, NaN]) {
      expect(saveGuidedTrainingCompletion(completedSession({ currentIndex }), { now: NOW })).toBeNull();
      expect(sessionStorage.getItem(GUIDED_TRAINING_COMPLETION_KEY)).toBeNull();
    }
    expect(saveGuidedTrainingCompletion(completedSession({ currentIndex: 2 }), { now: NOW })).not.toBeNull();
  });

  it('no convierte duraciones dañadas en una acreditación de 15 minutos', () => {
    for (const minutes of [null, undefined, '15', false, 0, 99]) {
      expect(saveGuidedTrainingCompletion(completedSession({ minutes }), { now: NOW })).toBeNull();
      expect(sessionStorage.getItem(GUIDED_TRAINING_COMPLETION_KEY)).toBeNull();
    }
    const healthy = saveGuidedTrainingCompletion(completedSession(), { now: NOW });
    for (const minutes of [null, '15', 99]) {
      sessionStorage.setItem(GUIDED_TRAINING_COMPLETION_KEY, JSON.stringify({ ...healthy, minutes }));
      expect(loadGuidedTrainingCompletion({ now: NOW })).toBeNull();
      expect(sessionStorage.getItem(GUIDED_TRAINING_COMPLETION_KEY)).toBeNull();
    }
    expect(saveGuidedTrainingCompletion(completedSession(), { now: NOW })?.minutes).toBe(15);
  });

  it('rechaza bloques cuyo tiempo es desconocido o imposible en vez de publicar NaN', () => {
    const original = completedSession();
    for (const minutes of [null, '8', -1, 0, 31, Infinity]) {
      const steps = original.steps.map((step, index) => index === 0 ? { ...step, minutes } : step);
      expect(saveGuidedTrainingCompletion(completedSession({ steps }), { now: NOW })).toBeNull();
      expect(sessionStorage.getItem(GUIDED_TRAINING_COMPLETION_KEY)).toBeNull();
    }
    const saved = saveGuidedTrainingCompletion(original, { now: NOW });
    for (const minutes of [null, 'Infinity', -1, 31, 16]) {
      sessionStorage.setItem(GUIDED_TRAINING_COMPLETION_KEY, JSON.stringify({
        ...saved, blocks: [{ ...saved.blocks[0], minutes }, saved.blocks[1]],
      }));
      expect(loadGuidedTrainingCompletion({ now: NOW })).toBeNull();
      expect(sessionStorage.getItem(GUIDED_TRAINING_COMPLETION_KEY)).toBeNull();
    }
    expect(loadGuidedTrainingCompletion({ now: NOW })).toBeNull();
    expect(saveGuidedTrainingCompletion(original, { now: NOW })?.blocks).toHaveLength(2);
  });

  it('no publica más minutos de práctica que el presupuesto total de la sesión', () => {
    const fiveMinute = {
      minutes: 5,
      currentIndex: 2,
      steps: [
        { id: 'a', kind: 'debt', action: 'personal-filter', title: 'Primer ejercicio', minutes: 4 },
        { id: 'b', kind: 'short-game', action: 'short-game', title: 'Segundo ejercicio', minutes: 4 },
        { id: 'review', kind: 'review', action: 'review', title: 'Cierre', minutes: 1 },
      ],
    };
    expect(saveGuidedTrainingCompletion(fiveMinute, { now: NOW })).toBeNull();
    expect(sessionStorage.getItem(GUIDED_TRAINING_COMPLETION_KEY)).toBeNull();

    const valid = saveGuidedTrainingCompletion(completedSession(), { now: NOW });
    expect(valid.blocks.reduce((sum, block) => sum + block.minutes, 0)).toBe(14);

    // Each block fits in 15 minutes individually, but 9 + 7 exceeds 15.
    sessionStorage.setItem(GUIDED_TRAINING_COMPLETION_KEY, JSON.stringify({
      ...valid, blocks: [
        { ...valid.blocks[0], minutes: 9 },
        { ...valid.blocks[1], minutes: 7 },
      ],
    }));
    expect(loadGuidedTrainingCompletion({ now: NOW })).toBeNull();
    expect(sessionStorage.getItem(GUIDED_TRAINING_COMPLETION_KEY)).toBeNull();
  });

  it('no redondea fracciones en el cierre ni en resúmenes restaurados', () => {
    const original = completedSession();
    for (const invalid of [0.1, 8.5, 8.9]) {
      const steps = original.steps.map((step, index) => index === 0 ? { ...step, minutes: invalid } : step);
      expect(saveGuidedTrainingCompletion(completedSession({ steps }), { now: NOW })).toBeNull();
      expect(sessionStorage.getItem(GUIDED_TRAINING_COMPLETION_KEY)).toBeNull();
    }

    const saved = saveGuidedTrainingCompletion(original, { now: NOW });
    expect(saved.blocks[0].minutes).toBe(8);
    for (const invalid of [0.1, 8.5, 8.9]) {
      sessionStorage.setItem(GUIDED_TRAINING_COMPLETION_KEY, JSON.stringify({
        ...saved, blocks: [{ ...saved.blocks[0], minutes: invalid }, saved.blocks[1]],
      }));
      expect(loadGuidedTrainingCompletion({ now: NOW })).toBeNull();
      expect(sessionStorage.getItem(GUIDED_TRAINING_COMPLETION_KEY)).toBeNull();
    }
  });

  it('exige identidades únicas, cierre terminal y presupuesto válido del plan original', () => {
    const original = completedSession();
    const corruptions = [
      original.steps.map((step, index) => index === 1 ? { ...step, id: 'debt' } : step),
      original.steps.map((step, index) => index === 0 ? { ...step, id: '' } : step),
      original.steps.map((step, index) => index === 0 ? { ...step, action: 'review' } : step),
      original.steps.map((step, index) => index === 2 ? { ...step, action: 'personal' } : step),
      original.steps.map((step, index) => index === 0 ? { ...step, kind: 'review' } : step),
      original.steps.map((step, index) => index === 2 ? { ...step, kind: 'debt' } : step),
      original.steps.map((step, index) => index === 2 ? { ...step, minutes: 2 } : step),
    ];
    for (const steps of corruptions) {
      expect(saveGuidedTrainingCompletion(completedSession({ steps }), { now: NOW })).toBeNull();
      expect(sessionStorage.getItem(GUIDED_TRAINING_COMPLETION_KEY)).toBeNull();
    }

    const saved = saveGuidedTrainingCompletion(original, { now: NOW });
    sessionStorage.setItem(GUIDED_TRAINING_COMPLETION_KEY, JSON.stringify({
      ...saved, blocks: [{ ...saved.blocks[0] }, { ...saved.blocks[1], id: saved.blocks[0].id }],
    }));
    expect(loadGuidedTrainingCompletion({ now: NOW })).toBeNull();
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
