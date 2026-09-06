import { afterEach, describe, expect, it } from 'vitest';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
import { WAR_ROOM_HANS_ELDER_WALK_VERSION } from './WarRoomHansElderWalk.js';
import { WAR_ROOM_HANS_FACING_GUARD_VERSION } from './WarRoomHansFacingGuard.js';
import { WAR_ROOM_HANS_POST_RENDER_PIPELINE_VERSION } from './WarRoomHansPostRenderPipeline.js';
import { setWarRoomHansQuickIterationEnabled } from './WarRoomHansIteration.js';

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse?.((object) => {
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

afterEach(() => setWarRoomHansQuickIterationEnabled(false));

describe('Hans layered locomotion pipeline integration', () => {
  it('runs facing correction before the additive elder gait in one shared pipeline', () => {
    setWarRoomHansQuickIterationEnabled(true);
    const room = buildPremiumWarRoomLayer({ felt: 0x173943, glow: 0xc5963f }, true, false);

    try {
      const finalizerDriver = room.getObjectByName('war-room-castle-floor-slab');
      expect(finalizerDriver?.userData?.warRoomDeferredFinalizerPhase).toBe('after');
      finalizerDriver.onAfterRender();

      const driver = room.getObjectByName('war-room-hans-fireplace-driver');
      expect(driver).toBeTruthy();
      expect(driver.userData.warRoomHansPostRenderPipeline).toBe(WAR_ROOM_HANS_POST_RENDER_PIPELINE_VERSION);
      expect(driver.userData.warRoomHansPostRenderStageCount).toBe(2);
      expect(driver.userData.warRoomHansPostRenderStages).toEqual([
        WAR_ROOM_HANS_FACING_GUARD_VERSION,
        WAR_ROOM_HANS_ELDER_WALK_VERSION,
      ]);
      expect(driver.userData.warRoomHansLocomotionOwnership).toBe('motion-polish-primary-elder-additive-v2');
      expect(driver.userData.warRoomHansElderWalk).toBe(WAR_ROOM_HANS_ELDER_WALK_VERSION);
    } finally {
      dispose(room);
    }
  });
});
