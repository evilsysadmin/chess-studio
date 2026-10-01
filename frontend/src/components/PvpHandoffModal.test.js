import { describe, expect, it } from 'vitest';
import { pvpHandoffParticipants, pvpHandoffPhase } from './PvpHandoffModal.jsx';

describe('PvP handoff participants', () => {
  it('projects names, colours and Elo from the authoritative white-side snapshot', () => {
    expect(pvpHandoffParticipants({
      youAre: 'w',
      white: 'e2e',
      black: 'bob',
      whiteRating: 1050,
      blackRating: 1210,
    })).toEqual({
      you: { username: 'e2e', rating: 1050, color: 'Blancas' },
      rival: { username: 'bob', rating: 1210, color: 'Negras' },
    });
  });

  it('projects the black-side snapshot without swapping authority', () => {
    expect(pvpHandoffParticipants({
      youAre: 'b',
      white: 'anna',
      black: 'e2e',
      whiteRating: 980,
      blackRating: 1050,
    })).toEqual({
      you: { username: 'e2e', rating: 1050, color: 'Negras' },
      rival: { username: 'anna', rating: 980, color: 'Blancas' },
    });
  });
});

describe('PvP handoff phase', () => {
  it('maps only existing match states to the ceremony presentation', () => {
    expect(pvpHandoffPhase({ status: 'starting' }, null)).toBe('sealing');
    expect(pvpHandoffPhase({ status: 'active' }, 5)).toBe('opening');
    expect(pvpHandoffPhase({ status: 'cancelled' }, null)).toBe('cancelled');
  });
});
