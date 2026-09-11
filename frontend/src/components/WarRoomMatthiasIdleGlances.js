import { getEffectiveReducedMotion } from '../userPreferences.js';
import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';

export const WAR_ROOM_MATTHIAS_IDLE_GLANCES_VERSION = 'matthias-idle-glances-v1';

const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const MATTHIAS_NAME = 'matthias-rival-king';
const HEAD_RIG_NAME = 'matthias-head-rig';
const POST_RENDER_ORDER = 50;
const CYCLE_MS = 24_000;
const ACTIVE_MS = 3_100;
const BLEND_IN_MS = 650;
const BLEND_OUT_MS = 900;

const GLANCES = Object.freeze([
  Object.freeze({ key: 'board', yaw: 0, pitch: 0.085 }),
  Object.freeze({ key: 'window', yaw: -0.16, pitch: 0.025 }),
  Object.freeze({ key: 'hearth', yaw: 0.13, pitch: 0.035 }),
]);

function smoothstep01(value) {
  const t = Math.max(0, Math.min(1, Number(value) || 0));
  return t * t * (3 - 2 * t);
}

export function resolveMatthiasIdleGlance(elapsedMs = 0) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const cycleIndex = Math.floor(elapsed / CYCLE_MS);
  const local = elapsed % CYCLE_MS;
  if (local >= ACTIVE_MS) return Object.freeze({ active: false, key: '', yaw: 0, pitch: 0, weight: 0 });

  const glance = GLANCES[cycleIndex % GLANCES.length];
  const inWeight = smoothstep01(local / BLEND_IN_MS);
  const outWeight = smoothstep01((ACTIVE_MS - local) / BLEND_OUT_MS);
  const weight = Math.min(inWeight, outWeight);
  return Object.freeze({
    active: weight > 0,
    key: glance.key,
    yaw: glance.yaw,
    pitch: glance.pitch,
    weight,
  });
}

export function installWarRoomMatthiasIdleGlances(root) {
  if (!root) return 0;
  const driver = root.getObjectByName?.(DRIVER_NAME);
  if (!driver || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomMatthiasIdleGlances === WAR_ROOM_MATTHIAS_IDLE_GLANCES_VERSION) return 0;

  let matthias = null;
  let headRig = null;
  let baseRotation = null;
  let startedAt = null;

  const registered = registerWarRoomHansPostRenderStage(driver, {
    key: WAR_ROOM_MATTHIAS_IDLE_GLANCES_VERSION,
    order: POST_RENDER_ORDER,
    run: () => {
      matthias ||= root.getObjectByName?.(MATTHIAS_NAME) || null;
      headRig ||= matthias?.getObjectByName?.(HEAD_RIG_NAME) || null;
      if (!matthias || !headRig) return;

      baseRotation ||= headRig.userData?.baseRotation?.clone?.() || headRig.rotation.clone();
      const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
      if (startedAt == null) startedAt = now;

      const blocked = getEffectiveReducedMotion()
        || Boolean(matthias.userData?.warRoomMatthiasHansReactionActive);
      const glance = blocked
        ? { active: false, key: '', yaw: 0, pitch: 0, weight: 0 }
        : resolveMatthiasIdleGlance(now - startedAt);

      headRig.rotation.x = baseRotation.x + glance.pitch * glance.weight;
      headRig.rotation.y = baseRotation.y + glance.yaw * glance.weight;
      headRig.rotation.z = baseRotation.z;
      matthias.userData.warRoomMatthiasIdleGlance = glance.key;
      matthias.userData.warRoomMatthiasIdleGlanceActive = glance.active;
    },
  });
  if (!registered) return 0;

  driver.userData.warRoomMatthiasIdleGlances = WAR_ROOM_MATTHIAS_IDLE_GLANCES_VERSION;
  return 1;
}
