import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWarRoomHansGameId } from './WarRoomHansActor.js';
import {
  WAR_ROOM_HANS_NO_GAME_CONTEXT_ID,
  warRoomHansEventForGame,
  warRoomHansEventMatches,
} from './WarRoomHansEventContract.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Hans game context lifecycle', () => {
  it('turns a missing/disconnected marker into a truthy inert context transition', () => {
    vi.stubGlobal('document', { querySelector: () => null });
    const actor = {
      gameMarker: {
        isConnected: false,
        getAttribute: () => 'stale-game',
      },
    };

    const contextId = getWarRoomHansGameId(actor);

    expect(contextId).toBe(WAR_ROOM_HANS_NO_GAME_CONTEXT_ID);
    expect(Boolean(contextId)).toBe(true);
    expect(warRoomHansEventForGame(contextId)).toBe('');
    expect(warRoomHansEventMatches(contextId, 'mop')).toBe(false);
    expect(warRoomHansEventMatches(contextId, 'espresso')).toBe(false);
  });

  it('keeps a real connected game id unchanged and eligible for one deterministic event', () => {
    const actor = {
      gameMarker: {
        isConnected: true,
        getAttribute: (name) => name === 'data-war-room-hans-game-id' ? 'game-live-42' : '',
      },
    };

    expect(getWarRoomHansGameId(actor)).toBe('game-live-42');
    expect(warRoomHansEventForGame('game-live-42')).not.toBe('');
  });
});
