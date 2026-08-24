import { beforeEach, describe, expect, it } from 'vitest';
import {
  MECHANIC_TUTORIALS,
  loadMechanicTutorialProgress,
  markMechanicTutorialSeen,
  mechanicTutorialById,
} from './mechanicTutorials.js';

beforeEach(() => localStorage.clear());

describe('tutoriales de mecánicas no estándar', () => {
  it('cada tutorial tiene id único y al menos dos pasos útiles', () => {
    const ids = MECHANIC_TUTORIALS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MECHANIC_TUTORIALS.every((item) => item.title && item.summary && item.steps.length >= 2)).toBe(true);
  });

  it('persiste qué tutoriales ya vio el jugador', () => {
    expect(loadMechanicTutorialProgress()).toEqual({});
    const next = markMechanicTutorialSeen('combat-deployment');
    expect(next['combat-deployment'].seen).toBe(true);
    expect(loadMechanicTutorialProgress()['combat-deployment'].seen).toBe(true);
  });
});

// v16.6dm6: la ayuda de Partida rápida debe describir la UI simplificada,
// donde sólo la dificultad es prominente y el resto vive bajo Ajustes.
describe('tutorial de partida rápida simplificada', () => {
  it('explica el flujo actual sin presentar los ajustes como pasos obligatorios', () => {
    const tutorial = mechanicTutorialById('quick-match-rules');
    expect(tutorial.title).toContain('Partida rápida');
    expect(tutorial.summary).toContain('Ajustes');
    expect(tutorial.steps.map((step) => `${step.title} ${step.text}`).join(' ')).toContain('Empezar partida');
    expect(tutorial.steps.map((step) => `${step.title} ${step.text}`).join(' ')).toContain('Reglas especiales');
  });
});
