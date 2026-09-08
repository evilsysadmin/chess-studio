import * as THREE from 'three';
import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';

export const WAR_ROOM_MATTHIAS_HANS_REACTION_VERSION = 'matthias-hans-reaction-v1';

const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const HANS_NAME = 'war-room-hans-butler';
const MATTHIAS_NAME = 'matthias-rival-king';
const POST_RENDER_ORDER = 45;
const TURN_BLEND = 0.34;
const RETURN_BLEND = 0.22;

function shortestAngle(from, to) {
  const delta = to - from;
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}

function headingTo(from, to, fallback) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if ((dx * dx + dz * dz) < 1e-8) return fallback;
  return Math.atan2(dx, dz);
}

export function installWarRoomMatthiasHansReaction(root) {
  if (!root) return 0;
  const driver = root.getObjectByName?.(DRIVER_NAME);
  const hans = root.getObjectByName?.(HANS_NAME);
  if (!driver || !hans || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomMatthiasHansReaction === WAR_ROOM_MATTHIAS_HANS_REACTION_VERSION) return 0;

  const matthiasWorld = new THREE.Vector3();
  const hansWorld = new THREE.Vector3();
  let matthias = null;
  let canvas = null;
  let baseYaw = null;

  const registered = registerWarRoomHansPostRenderStage(driver, {
    key: WAR_ROOM_MATTHIAS_HANS_REACTION_VERSION,
    order: POST_RENDER_ORDER,
    run: () => {
      matthias ||= root.getObjectByName?.(MATTHIAS_NAME) || null;
      if (!matthias) return;
      canvas ||= globalThis.document?.querySelector?.('.game-board-stack-3d .board3d-main-canvas') || null;
      if (baseYaw == null) baseYaw = Number(matthias.rotation.y) || 0;

      const narrativePhase = canvas?.dataset?.warRoomHansNarrativePhase || '';
      if (narrativePhase !== 'matthias-working' || hans.visible === false) {
        matthias.rotation.y += shortestAngle(matthias.rotation.y, baseYaw) * RETURN_BLEND;
        matthias.userData.warRoomMatthiasHansReactionActive = false;
        return;
      }

      matthias.getWorldPosition(matthiasWorld);
      hans.getWorldPosition(hansWorld);
      const targetYaw = headingTo(matthiasWorld, hansWorld, baseYaw);
      const subtleYaw = baseYaw + shortestAngle(baseYaw, targetYaw) * TURN_BLEND;
      matthias.rotation.y += shortestAngle(matthias.rotation.y, subtleYaw) * 0.38;
      matthias.userData.warRoomMatthiasHansReactionActive = true;
      matthias.userData.warRoomMatthiasHansReaction = WAR_ROOM_MATTHIAS_HANS_REACTION_VERSION;
    },
  });
  if (!registered) return 0;

  driver.userData.warRoomMatthiasHansReaction = WAR_ROOM_MATTHIAS_HANS_REACTION_VERSION;
  return 1;
}