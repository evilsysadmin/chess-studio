import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PostGameExperience from './PostGameExperience.jsx';

const FINISHED_GAME = {
  id: 'game-1',
  isGameOver: true,
  status: 'checkmate',
  turn: 'b',
  difficulty: 50,
  history: [{ from: 'g6', to: 'g7', san: 'Qg7#' }],
};

function render(props = {}) {
  return renderToStaticMarkup(
    <PostGameExperience
      game={FINISHED_GAME}
      humanColor="w"
      statusLabel="Jaque mate"
      finalOutcome="win"
      onLeave={() => {}}
      {...props}
    />,
  );
}

describe('PostGameExperience', () => {
  it('cierra la partida con un debrief editorial de Matthias y deja la autopsia a un clic', () => {
    const html = render({ onShareResult: () => {}, onTrainPersonal: () => {} });
    expect(html).toContain('PARTIDA FINALIZADA');
    expect(html).toContain('MATTHIAS // DEBRIEF');
    expect(html).toContain('¡Ganaste la partida!');
    expect(html).toContain('Bien. Has ganado.');
    expect(html).toContain('QUÉ MIRAR AHORA');
    expect(html).toContain('Resumen de la partida');
    expect(html).toContain('Más opciones');
    expect(html).not.toContain('Compartir resultado');
    expect(html).not.toContain('Entrenar mis errores');
  });

  it('muestra la recalibración factual sólo cuando el resumen trae un cambio material', () => {
    const html = render({
      resultSummary: {
        ratingApplied: true,
        adaptiveDifficulty: true,
        eloAfter: 1000,
        ratingGames: 20,
        detail: 'Rating +12 · 988 → 1000',
      },
    });
    expect(html).toContain('Próximo reto adaptativo');
    expect(html).toContain('Próximo reto adaptativo · algo más exigente · Intermedio');
    expect(html).not.toContain('Matthias ≈');
    expect(html).not.toMatch(/Próximo reto adaptativo[^<]*Elo/);

    const stable = render({
      resultSummary: { ratingApplied: true, detail: 'Rating +2 · 1000 → 1002' },
    });
    expect(stable).not.toContain('Próximo reto adaptativo');
  });

  it('prioriza el comentario real de Matthias sobre el fallback editorial', () => {
    const html = render({ lastCpuComment: 'Ese mate ha sido limpio. No te acostumbres al elogio.' });
    expect(html).toContain('Ese mate ha sido limpio. No te acostumbres al elogio.');
    expect(html).not.toContain('Bien. Has ganado. Disfrútalo con moderación');
  });

  it('prioriza continuar una serie en curso sin añadir opciones laterales', () => {
    const html = render({
      seriesState: { bestOf: 3, humanWins: 1, cpuWins: 0, games: [{ outcome: 'win' }], winner: null },
      onNextSeriesGame: () => {},
      onShareResult: () => {},
      onTrainPersonal: () => {},
    });
    expect(html).toContain('Intentar cerrar la serie');
    expect(html).toContain('Volver al menú');
    expect(html).not.toContain('Más opciones');
    expect(html).not.toContain('Compartir resultado');
    expect(html).not.toContain('Entrenar mis errores');
  });
});