import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../guidedTrainingSession.js', () => ({
  advanceGuidedTrainingSession: vi.fn(),
  clearGuidedTrainingSession: vi.fn(),
  loadGuidedTrainingSession: () => null,
  startGuidedTrainingSession: vi.fn(),
  buildGuidedTrainingPlan: ({ minutes }) => ({
    minutes,
    available: true,
    reason: null,
    steps: [
      {
        id: `focus-${minutes}`,
        kind: 'debt',
        title: 'Foco real',
        detail: 'Basado en evidencia.',
        action: 'personal-filter',
        filter: { incidentKey: 'human:MISSED_MATE' },
        featuredPuzzleId: 'chosen-drill',
        minutes,
      },
    ],
  }),
}));

vi.mock('../guidedTrainingCompletion.js', () => ({
  clearGuidedTrainingCompletion: vi.fn(),
  saveGuidedTrainingCompletion: vi.fn(),
  loadGuidedTrainingCompletion: () => ({
    minutes: 15,
    completedAt: 1_800_000_000_000,
    blocks: [
      { id: 'focus', kind: 'debt', title: 'Foco real', minutes: 8 },
      { id: 'game', kind: 'short-game', title: 'Partida corta de práctica', minutes: 6 },
    ],
  }),
}));

vi.mock('./InsightsPositionAutopsy.jsx', () => ({
  default: ({ puzzle }) => 'Preview: ' + (puzzle?.id || 'none'),
}));

import InsightsGuidedSession from './InsightsGuidedSession.jsx';

describe('InsightsGuidedSession time budgets', () => {
  it('pone una tarea real en primer plano y muestra 5/15/30 sin esconder el tiempo', () => {
    const html = renderToStaticMarkup(<InsightsGuidedSession gameHistory={[]} />);

    expect(html).toContain('Tu siguiente tarea');
    expect(html).toContain('Foco real');
    expect(html).toContain('Basado en evidencia.');
    expect(html).toContain('Empezar sesión recomendada de 5 min');
    expect(html).toContain('aria-label="Cambiar tiempo"');
    expect(html).toContain('Tengo 5 min');
    expect(html).toContain('Tengo 15 min');
    expect(html).toContain('Tengo 30 min');
    expect(html).toContain('data-training-preview-minutes="5"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Ver el recorrido de 5 min');
    expect(html).toContain('1 bloque de práctica');
    expect(html).toContain('Patrón registrado');
    expect(html).not.toContain('Hoy toca esto');
  });

  it('previsualiza sólo el puzzle seleccionado por el plan, aunque otro aparezca primero', () => {
    const html = renderToStaticMarkup(<InsightsGuidedSession
      gameHistory={[]}
      personalPuzzles={[
        { id: 'wrong-drill', fen: 'fen-one', incidentKeys: ['human:MISSED_MATE'], cleanSolves: 0 },
        { id: 'chosen-drill', fen: 'fen-two', incidentKeys: ['human:MISSED_MATE'], cleanSolves: 0 },
      ]}
    />);
    expect(html).toContain('Preview: chosen-drill');
    expect(html).not.toContain('Preview: wrong-drill');
    expect(html).toContain('aria-label="Entrenar esta posición real ahora"');
  });

  it('oculta el atajo directo cuando el caso seleccionado ya no está disponible', () => {
    const html = renderToStaticMarkup(<InsightsGuidedSession
      gameHistory={[]}
      personalPuzzles={[
        { id: 'wrong-drill', fen: 'fen-one', incidentKeys: ['human:MISSED_MATE'], cleanSolves: 0 },
      ]}
    />);
    expect(html).not.toContain('aria-label="Entrenar esta posición real ahora"');
    expect(html).toContain('Empezar · 5 min');
  });

  it('resume sólo los bloques que el usuario marcó como hechos y no vende mejora', () => {
    const html = renderToStaticMarkup(<InsightsGuidedSession gameHistory={[]} />);

    expect(html).toContain('Última sesión · 15 min');
    expect(html).toContain('Marcaste como hechos 2 bloques de práctica');
    expect(html).toContain('Foco real');
    expect(html).toContain('Partida corta de práctica');
    expect(html).toContain('no afirma que hayas mejorado');
  });
});
