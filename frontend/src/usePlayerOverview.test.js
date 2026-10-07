import { describe, expect, it } from 'vitest';
import { combatOverviewFrom } from './usePlayerOverview.js';

describe('player overview projection', () => {
  it('deriva sólo los datos de cabecera desde los owners existentes', () => {
    expect(combatOverviewFrom(
      { credits: 37, units: [{ id: 'u-1' }] },
      { rank: 'Sargento', nextProgress: { current: 12, target: 20 }, hidden: 'ignored' },
    )).toEqual({
      credits: 37,
      rank: 'Sargento',
      nextProgress: { current: 12, target: 20 },
    });
  });

  it('normaliza créditos ausentes a cero', () => {
    expect(combatOverviewFrom({}, { rank: 'Recluta', nextProgress: null })).toEqual({
      credits: 0,
      rank: 'Recluta',
      nextProgress: null,
    });
  });
});
