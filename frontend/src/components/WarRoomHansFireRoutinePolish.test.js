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
  it('starts the board peek on the first exit leg and never waits for the armor bypass', () => {
    expect(HANS_BOARD_PEEK_ROUTE).toBe('leave-side');
    expect(hansBoardPeekPointReached({
      phase: 'await-exit-peek',
      route: 'leave-side',
      logicalX: 1.42,
    })).toBe(true);
    expect(hansBoardPeekPointReached({
      phase: 'await-exit-peek',
      route: 'leave-side',
      logicalX: 0.55,
    })).toBe(true);
    expect(hansBoardPeekPointReached({
      phase: 'await-exit-peek',
      route: 'leave-bypass',
      logicalX: 0.55,
    })).toBe(false);
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
