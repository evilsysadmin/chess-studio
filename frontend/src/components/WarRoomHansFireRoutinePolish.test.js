import { afterEach, describe, expect, it } from 'vitest';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
import {
  HANS_BOARD_PEEK_ROUTE,
  hansBoardPeekPointReached,
} from './WarRoomHansFireCallContract.js';
import { setWarRoomHansQuickIterationEnabled } from './WarRoomHansIteration.js';

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      material.dispose?.();
    }
  });
}

function runHansFirstFrame(room) {
  const finalizerDriver = room.getObjectByName('war-room-castle-floor-slab');
  expect(finalizerDriver?.userData?.warRoomDeferredFinalizerPhase).toBe('after');
  finalizerDriver.onAfterRender();
}

afterEach(() => setWarRoomHansQuickIterationEnabled(false));

describe('Hans fire routine polish', () => {
  it('waits for the door-bypass route but tolerates geometry guards clamping Hans sideways', () => {
    expect(HANS_BOARD_PEEK_ROUTE).toBe('leave-bypass');
    expect(hansBoardPeekPointReached({
      phase: 'await-exit-peek',
      route: 'leave-side',
      logicalX: 1.42,
    })).toBe(false);
    expect(hansBoardPeekPointReached({
      phase: 'await-exit-peek',
      route: 'leave-bypass',
      logicalX: 0.55,
    })).toBe(true);
  });

  it('rigs the carried poker to Hans right arm so the tool follows the stoking gesture', () => {
    setWarRoomHansQuickIterationEnabled(true);
    const room = buildPremiumWarRoomLayer({ felt: 0x173943, glow: 0xc5963f }, true, false);
    try {
      runHansFirstFrame(room);
      const hans = room.getObjectByName('war-room-hans-butler');
      const carriedPoker = room.getObjectByName('war-room-hans-carried-poker');
      expect(hans).toBeTruthy();
      expect(carriedPoker).toBeTruthy();
      expect(carriedPoker.parent).toBe(hans.userData.refs.rightArm);
      expect(carriedPoker.userData.warRoomHansPokerRig).toBe('right-hand-follow-v1');
      expect(hans.userData.warRoomHansPokerRig).toBe('right-hand-follow-v1');
    } finally {
      dispose(room);
    }
  });
});
