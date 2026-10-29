import { describe, expect, it } from 'vitest';
import { shouldShowNewLiveBoardRemark } from './warRoomLiveNarrative.js';

describe('War Room live narrative ownership', () => {
  it('ignora el historial hidratado en F5/remount y otros cambios de partida', () => {
    expect(shouldShowNewLiveBoardRemark({ gameId: 'a', trackedGameId: 'a', currentKey: 'event-7', seenKey: 'event-7' })).toBe(false);
    expect(shouldShowNewLiveBoardRemark({ gameId: 'b', trackedGameId: 'a', currentKey: 'event-7', seenKey: 'event-5' })).toBe(false);
    expect(shouldShowNewLiveBoardRemark({ gameId: 'a', trackedGameId: 'a', currentKey: '', seenKey: 'event-6' })).toBe(false);
  });

  it('permite una sola aparición de un evento nuevo de la misma partida', () => {
    const event = { gameId: 'a', trackedGameId: 'a', currentKey: 'event-8', seenKey: 'event-7' };
    expect(shouldShowNewLiveBoardRemark(event)).toBe(true);
    expect(shouldShowNewLiveBoardRemark({ ...event, seenKey: 'event-8' })).toBe(false);
  });
});
