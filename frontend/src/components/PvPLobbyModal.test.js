import { describe, expect, it } from 'vitest';
import { pvpHeadToHeadLabel } from './PvPLobbyModal.jsx';

describe('PvP roster head-to-head label', () => {
  it('stays silent when there is no persisted history', () => {
    expect(pvpHeadToHeadLabel(null)).toBe('');
    expect(pvpHeadToHeadLabel({ games: 0, wins: 0, draws: 0, losses: 0 })).toBe('');
  });

  it('summarizes only the factual persisted record', () => {
    expect(pvpHeadToHeadLabel({ games: 5, wins: 2, draws: 1, losses: 2 })).toBe('VS TI · 2V 1T 2D');
  });
});
