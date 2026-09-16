import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_LOCAL,
  removeStorageItem,
} from '../safeStorage.js';
import { markWarRoomHansAmbientEffectCompleted } from './WarRoomHansAmbientCompletion.js';
import { WAR_ROOM_HANS_COMPLETED_GAMES_KEY } from './WarRoomHansPerGame.js';
import { restoreWarRoomHansPersistedServiceEffect } from './WarRoomHansServiceRoutine.js';

describe('Hans service persistence', () => {
  beforeEach(() => {
    removeStorageItem(STORAGE_LOCAL, WAR_ROOM_HANS_COMPLETED_GAMES_KEY);
  });

  it('rehydrates a delivered espresso after remount', () => {
    const deliveredEspresso = { visible: false };
    expect(markWarRoomHansAmbientEffectCompleted('game-espresso', 'espresso')).toBe(true);

    expect(restoreWarRoomHansPersistedServiceEffect('game-espresso', 'espresso', {
      deliveredEspresso,
    })).toBe(true);
    expect(deliveredEspresso.visible).toBe(true);
  });

  it('retries espresso when persisted completion cannot reconstruct the visible cup', () => {
    expect(markWarRoomHansAmbientEffectCompleted('game-espresso', 'espresso')).toBe(true);
    expect(restoreWarRoomHansPersistedServiceEffect('game-espresso', 'espresso')).toBe(false);
  });

  it('restores the watered marker without replaying the watering routine', () => {
    const plant = { userData: {} };
    expect(markWarRoomHansAmbientEffectCompleted('game-water', 'water-plant')).toBe(true);

    expect(restoreWarRoomHansPersistedServiceEffect('game-water', 'water-plant', { plant })).toBe(true);
    expect(plant.userData.warRoomHansLastWatered).toBe('game-water');
  });

  it('does not suppress a service event that never reached its effect point', () => {
    const deliveredEspresso = { visible: false };
    expect(restoreWarRoomHansPersistedServiceEffect('game-pending', 'espresso', {
      deliveredEspresso,
    })).toBe(false);
    expect(deliveredEspresso.visible).toBe(false);
  });
});
