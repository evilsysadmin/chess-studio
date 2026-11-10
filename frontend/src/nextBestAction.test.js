import { describe, expect, it } from 'vitest';
import { homeNextBestAction, nextBestAction } from './nextBestAction.js';

describe('nextBestAction', () => {
  it('prioriza revisar una derrota suficientemente larga', () => {
    expect(nextBestAction({ outcome: 'loss', moveCount: 18, hasReport: true }).id).toBe('review');
  });

  it('prioriza entrenar un error real sobre revisar o repetir', () => {
    expect(nextBestAction({ outcome: 'loss', moveCount: 18, hasReport: true, canTrainCurrentError: true, canPlayAgain: true }))
      .toMatchObject({ id: 'train-error', label: 'Entrenar este error' });
  });

  it('propone avanzar tras victoria o tablas sin ofrecer revancha', () => {
    expect(nextBestAction({ outcome: 'win' }).id).toBe('advance');
    expect(nextBestAction({ outcome: 'draw' }).id).toBe('advance');
    expect(nextBestAction({ outcome: 'win' }).label).toBeTruthy();
    expect(nextBestAction({ outcome: 'draw' }).detail.toLowerCase()).not.toContain('revancha');
  });

  it('no promete subir dificultad solo por ganar: el CTA lleva a elegir otro reto', () => {
    expect(nextBestAction({ outcome: 'win', hasReport: true, canPlayAgain: false }))
      .toMatchObject({
        id: 'advance',
        title: 'Elige tu siguiente reto',
        detail: 'Vuelve al castillo para elegir otra partida o entrenar.',
      });
  });

  it('no inventa una ventaja desperdiciada en tablas y solo ofrece resumen cuando existe', () => {
    expect(nextBestAction({ outcome: 'draw', hasReport: true, canPlayAgain: false }))
      .toMatchObject({
        id: 'advance',
        title: 'Decide cómo continuar',
        detail: 'Consulta el resumen para comprobar si hubo oportunidades reales, o elige otro reto.',
      });
    expect(nextBestAction({ outcome: 'draw', hasReport: false, canPlayAgain: false }))
      .toMatchObject({
        id: 'advance',
        detail: 'Vuelve al castillo y elige cómo continuar.',
      });
  });

  it('conserva la revancha real como prioridad para victoria y tablas', () => {
    for (const outcome of ['win', 'draw']) {
      expect(nextBestAction({ outcome, hasReport: true, canPlayAgain: true }))
        .toMatchObject({ id: 'play-again', label: 'Jugar otra partida' });
    }
  });

  it('hace que Home continúe el último modo principal terminado', () => {
    expect(homeNextBestAction([
      { state: 'started', mode: 'casual' },
      { state: 'finished', mode: 'tournament', outcome: 'loss' },
    ])).toMatchObject({ id: 'tournament', label: 'Continuar Torneo' });

    expect(homeNextBestAction([
      { state: 'finished', mode: 'practice', outcome: 'win' },
      { state: 'finished', mode: 'casual', outcome: 'loss' },
    ])).toMatchObject({ id: 'practice', label: 'Continuar práctica' });
  });

  it('ignora modos sin retorno directo y cae a partida rápida cuando no hay núcleo previo', () => {
    expect(homeNextBestAction([{ state: 'finished', mode: 'boss', outcome: 'win' }])).toMatchObject({ id: 'quick', label: 'Jugar ahora' });
    expect(homeNextBestAction([])).toMatchObject({ id: 'quick', label: 'Jugar ahora' });
  });
});
