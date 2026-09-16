import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_LOCAL,
  removeStorageItem,
} from '../safeStorage.js';
import { WAR_ROOM_HANS_NO_GAME_CONTEXT_ID } from './WarRoomHansEventContract.js';
import { WAR_ROOM_HANS_COMPLETED_GAMES_KEY } from './WarRoomHansPerGame.js';
import {
  markWarRoomHansAmbientEffectCompleted,
  warRoomHansAmbientCompletionState,
  warRoomHansAmbientDeliveryArtifact,
} from './WarRoomHansAmbientCompletion.js';

describe('Hans ambient completion contract', () => {
  beforeEach(() => {
    removeStorageItem(STORAGE_LOCAL, WAR_ROOM_HANS_COMPLETED_GAMES_KEY);
  });

  it('ignores missing context and the separately-owned fireplace event', () => {
    expect(markWarRoomHansAmbientEffectCompleted(WAR_ROOM_HANS_NO_GAME_CONTEXT_ID, 'espresso')).toBe(false);
    expect(markWarRoomHansAmbientEffectCompleted('game-fire', 'fire')).toBe(false);
    expect(warRoomHansAmbientCompletionState('game-fire', 'fire').completed).toBe(false);
  });

  it('persists a completed ambient effect once per real game id', () => {
    expect(warRoomHansAmbientCompletionState('game-espresso', 'espresso')).toEqual({
      completed: false,
      deliveryArtifact: '',
    });
    expect(markWarRoomHansAmbientEffectCompleted('game-espresso', 'espresso')).toBe(true);
    expect(warRoomHansAmbientCompletionState('game-espresso', 'espresso')).toEqual({
      completed: true,
      deliveryArtifact: 'espresso',
    });
    expect(markWarRoomHansAmbientEffectCompleted('game-espresso', 'espresso')).toBe(false);
  });

  it.each([
    ['espresso', 'espresso'],
    ['bring-book', 'bring-book'],
    ['mail', 'mail'],
    ['water-plant', ''],
    ['mop', ''],
    ['dust-board', ''],
  ])('maps persisted event %s to restore artifact %s', (eventName, artifact) => {
    expect(warRoomHansAmbientDeliveryArtifact(eventName)).toBe(artifact);
  });
});
