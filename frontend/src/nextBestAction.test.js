import { describe, expect, it } from 'vitest';
import { homeNextBestAction, nextBestAction } from './nextBestAction.js';

describe('nextBestAction', () => {
  it('prioriza revisar una derrota suficientemente larga', () => {
    expect(nextBestAction({ outcome: 'loss', moveCount: 18, hasReport: true }).id).toBe('review');
  });

  it('propone avanzar tras victoria o tablas sin ofrecer revancha', () => {
    expect(nextBestAction({ outcome: 'win' }).id).toBe('advance');
    expect(nextBestAction({ outcome: 'draw' }).id).toBe('advance');
    expect(nextBestAction({ outcome: 'win' }).label).toBeTruthy();
    expect(nextBestAction({ outcome: 'draw' }).detail.toLowerCase()).not.toContain('revancha');
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
