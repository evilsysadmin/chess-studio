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

  it('adapta Home al último resultado terminado sin usar datos privados', () => {
    expect(homeNextBestAction([{ state: 'started' }, { state: 'finished', outcome: 'loss' }]).id).toBe('practice');
    expect(homeNextBestAction([{ state: 'finished', outcome: 'win' }]).id).toBe('tournament');
    expect(homeNextBestAction([])).toBeNull();
  });
});
