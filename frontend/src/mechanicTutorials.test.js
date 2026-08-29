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

// La ayuda de Partida rápida debe describir la UI simplificada sin fijar el
// nombre editorial del disclosure: el contrato útil son sus opciones.
describe('tutorial de partida rápida simplificada', () => {
  it('explica el flujo actual sin presentar los ajustes como pasos obligatorios', () => {
    const tutorial = mechanicTutorialById('quick-match-rules');
    const copy = [tutorial.summary, ...tutorial.steps.map((step) => `${step.title} ${step.text}`)].join(' ');
    expect(tutorial.title).toContain('Partida rápida');
    expect(copy).toContain('color');
    expect(copy).toContain('reloj');
    expect(copy).toContain('Empezar partida');
    expect(copy).toContain('Reglas especiales');
  });
});

describe('tutorial de despliegue con defaults', () => {
  it('deja claro que personalizar es opcional', () => {
    const tutorial = mechanicTutorialById('combat-deployment');
    const copy = [tutorial.summary, ...tutorial.steps.map((step) => `${step.title} ${step.text}`)].join(' ');
    expect(copy).toContain('un clic');
    expect(copy).toContain('opcional');
  });
});

describe('tutorial de Supervivencia', () => {
  it('explica el escalado y que cualquier resultado que no sea victoria termina la run', () => {
    const tutorial = mechanicTutorialById('survival');
    const copy = [tutorial.summary, ...tutorial.steps.map((step) => `${step.title} ${step.text}`)].join(' ');
    expect(tutorial.title).toBe('Supervivencia');
    expect(copy).toContain('CPU 30');
    expect(copy).toContain('7 puntos');
    expect(copy).toContain('derrota');
    expect(copy).toContain('tablas');
    expect(copy).toContain('récord');
  });
});
