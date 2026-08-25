import { describe, expect, it } from 'vitest';
import { homeNextBestAction, nextBestAction } from './nextBestAction.js';

describe('nextBestAction', () => {
  it('prioriza revisar una derrota suficientemente larga', () => {
    expect(nextBestAction({ outcome: 'loss', moveCount: 18, hasReport: true }).id).toBe('review');
  });

  it('propone continuidad tras victoria o tablas', () => {
    expect(nextBestAction({ outcome: 'win' }).label).toBe('Jugar otra');
    expect(nextBestAction({ outcome: 'draw' }).id).toBe('again');
  });

  it('adapta Home al último resultado terminado sin usar datos privados', () => {
    expect(homeNextBestAction([{ state: 'started' }, { state: 'finished', outcome: 'loss' }]).id).toBe('practice');
    expect(homeNextBestAction([{ state: 'finished', outcome: 'win' }]).id).toBe('tournament');
    expect(homeNextBestAction([])).toBeNull();
  });
});
