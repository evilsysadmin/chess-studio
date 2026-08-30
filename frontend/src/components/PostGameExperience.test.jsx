import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PostGameExperience, { canOfferPostGameTraining } from './PostGameExperience.jsx';

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
  it('conserva el resumen y acciones finales fuera de GameScreen', () => {
    const html = render({ onShareResult: () => {}, onTrainPersonal: () => {} });
    expect(html).toContain('PARTIDA FINALIZADA');
    expect(html).toContain('¡Ganaste la partida!');
    expect(html).toContain('Compartir resultado');
    expect(html).toContain('Entrenar mis errores');
    expect(html).toContain('Resumen de la partida');
  });

  it('prioriza continuar una serie en curso sin invitar a abandonar el match para entrenar', () => {
    const seriesState = { bestOf: 3, humanWins: 1, cpuWins: 0, games: [{ outcome: 'win' }], winner: null };
    const html = render({
      seriesState,
      onNextSeriesGame: () => {},
      onTrainPersonal: () => {},
    });
    expect(html).toContain('Intentar cerrar la serie');
    expect(html).toContain('Volver al menú');
    expect(html).not.toContain('Entrenar mis errores');
    expect(canOfferPostGameTraining({ onTrainPersonal: () => {}, seriesState })).toBe(false);
  });

  it('no ofrece entrenamiento durante una run activa y sí al terminar el flujo competitivo', () => {
    expect(canOfferPostGameTraining({ onTrainPersonal: () => {}, runState: { active: true } })).toBe(false);
    expect(canOfferPostGameTraining({ onTrainPersonal: () => {}, seriesState: { winner: 'human' } })).toBe(true);
    expect(canOfferPostGameTraining({ onTrainPersonal: null })).toBe(false);
  });
});
