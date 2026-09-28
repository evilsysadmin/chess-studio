import { describe, expect, it } from 'vitest';
import { pvpChallengeCooldownLabel, pvpChatRelativeTimeLabel, pvpHeadToHeadLabel } from './PvPLobbyModal.jsx';

describe('PvP roster head-to-head label', () => {
  it('stays silent when there is no persisted history', () => {
    expect(pvpHeadToHeadLabel(null)).toBe('');
    expect(pvpHeadToHeadLabel({ games: 0, wins: 0, draws: 0, losses: 0 })).toBe('');
  });

  it('summarizes only the factual persisted record', () => {
    expect(pvpHeadToHeadLabel({ games: 5, wins: 2, draws: 1, losses: 2 })).toBe('VS TI · 2V 1T 2D');
  });
});


describe('PvP roster challenge cooldown label', () => {
  it('stays silent without a server timestamp', () => {
    expect(pvpChallengeCooldownLabel(null)).toBe('');
    expect(pvpChallengeCooldownLabel('not-a-date')).toBe('');
  });

  it('marks a server-provided cooldown as a temporary pause', () => {
    expect(pvpChallengeCooldownLabel('2099-01-01T10:00:20Z')).toMatch(/^PAUSA · hasta /);
  });
});


describe('PvP lobby chat relative time', () => {
  const now = Date.parse('2099-01-01T10:00:00Z');

  it('uses compact labels for fresh messages', () => {
    expect(pvpChatRelativeTimeLabel('2099-01-01T09:59:40Z', now)).toBe('ahora');
    expect(pvpChatRelativeTimeLabel('2099-01-01T09:57:00Z', now)).toBe('3m');
    expect(pvpChatRelativeTimeLabel('2099-01-01T08:00:00Z', now)).toBe('2h');
  });

  it('stays silent for invalid timestamps', () => {
    expect(pvpChatRelativeTimeLabel('nope', now)).toBe('');
  });
});
