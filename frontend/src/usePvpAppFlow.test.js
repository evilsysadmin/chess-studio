import { describe, expect, it } from 'vitest';
import { pvpEntryRotationDecision } from './usePvpAppFlow.js';

const pending = { challengeId: 'c-1', seen: false };
const lobbyWith = (...challenges) => ({ challenges });

describe('Duel Room landscape taken on the «Retar» tap', () => {
  it('hands the rotation to the Duel Room as soon as a duel starts', () => {
    // The accept snapshot carries the activeMatch together with the accepted
    // challenge row: it must never be read as a refusal and drop landscape.
    const accepted = lobbyWith({ id: 'c-1', status: 'accepted' });
    expect(pvpEntryRotationDecision({ pending, lobby: accepted, activeMatch: { id: 'm-1' } })).toBe('duel');
    expect(pvpEntryRotationDecision({ pending, lobby: accepted, handoffMatch: { id: 'm-1' } })).toBe('duel');
    expect(pvpEntryRotationDecision({ pending, lobby: accepted, match: { id: 'm-1' } })).toBe('duel');
  });

  it('keeps landscape while the challenge waits for the rival', () => {
    expect(pvpEntryRotationDecision({ pending, lobby: lobbyWith({ id: 'c-1', status: 'pending' }) })).toBe('seen');
  });

  it('does not drop landscape before the lobby has caught up with the new challenge', () => {
    expect(pvpEntryRotationDecision({ pending, lobby: lobbyWith() })).toBe('wait');
    expect(pvpEntryRotationDecision({ pending, lobby: undefined })).toBe('wait');
  });

  it('releases landscape when the challenge ends without a duel', () => {
    const seen = { ...pending, seen: true };
    // cancelled/declined/expired rows disappear from the lobby…
    expect(pvpEntryRotationDecision({ pending: seen, lobby: lobbyWith() })).toBe('release');
    // …or show a terminal status.
    expect(pvpEntryRotationDecision({ pending, lobby: lobbyWith({ id: 'c-1', status: 'declined' }) })).toBe('release');
    expect(pvpEntryRotationDecision({ pending: null, lobby: lobbyWith() })).toBe('release');
  });

  it('only follows the challenge it armed', () => {
    const other = lobbyWith({ id: 'c-2', status: 'pending' });
    expect(pvpEntryRotationDecision({ pending, lobby: other })).toBe('wait');
    expect(pvpEntryRotationDecision({ pending: { ...pending, seen: true }, lobby: other })).toBe('release');
  });
});
