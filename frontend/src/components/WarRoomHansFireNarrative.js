export const WAR_ROOM_HANS_FIRE_NARRATIVE_VERSION = 'cold-hearth-call-v1';
export const WAR_ROOM_HANS_COLD_FIRE_SCALE = 0;

const HANS_DRIVER_NAME = 'war-room-hans-fireplace-driver';
const FIREPLACE_NAME = 'war-room-fireplace';
const FIRE_CORE_NAME = 'war-room-fire-core';
const FIRE_LIGHT_NAME = 'war-room-fire-light';
const BOUNCE_LIGHT_NAME = 'war-room-fire-bounce-light';

const SOURCE_STOKE_MIN = 0.26;
const SOURCE_STOKE_MAX = 1.08;
const COLD_PHASES = new Set([
  'fire-dimming',
  'walk-to-basket',
  'take-log',
  'carry-log',
  'place-log',
  'take-poker',
]);

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function readScaleY(scale, fallback = 1) {
  const value = Number(scale?.y);
  return Number.isFinite(value) && Math.abs(value) > 1e-9 ? value : fallback;
}

export function warRoomHansNarrativeFireState({ phase = '', sourceScale = 1 } = {}) {
  if (COLD_PHASES.has(String(phase || ''))) {
    return {
      mode: 'cold',
      narrativePhase: 'hearth-cold',
      flameVisible: false,
      flameScale: WAR_ROOM_HANS_COLD_FIRE_SCALE,
      lightScale: 0.035,
      distanceScale: 0.36,
      bounceScale: 0.025,
    };
  }

  if (phase === 'stoke-fire') {
    const progress = smoothstep01(
      (Number(sourceScale || 0) - SOURCE_STOKE_MIN) / (SOURCE_STOKE_MAX - SOURCE_STOKE_MIN),
    );
    return {
      mode: 'ignite',
      narrativePhase: progress < 0.72 ? 'hearth-igniting' : 'hearth-catching',
      flameVisible: true,
      flameScale: 0.025 + progress * 1.055,
      lightScale: 0.045 + progress * 0.955,
      distanceScale: 0.38 + progress * 0.62,
      bounceScale: 0.03 + progress * 0.97,
    };
  }

  return {
    mode: 'passthrough',
    narrativePhase: 'hearth-lit',
    flameVisible: true,
  };
}

function setScale(scale, x, y, z) {
  if (typeof scale?.set === 'function') {
    scale.set(x, y, z);
    return;
  }
  if (!scale) return;
  scale.x = x;
  scale.y = y;
  scale.z = z;
}

function resolveBaseIntensity(light, fallback = 1) {
  const declared = Number(light?.userData?.baseWarRoomIntensity);
  if (Number.isFinite(declared) && declared > 0) return declared;
  const current = Number(light?.intensity);
  return Number.isFinite(current) && current > 0 ? current : fallback;
}

function resolveBounce(refs) {
  if (refs.bounce) return refs.bounce;
  const bounce = refs.fireplace?.getObjectByName?.(BOUNCE_LIGHT_NAME) || null;
  if (!bounce) return null;
  refs.bounce = bounce;
  const declared = Number(bounce?.userData?.hansBaseIntensity);
  refs.bounceBaseIntensity = Number.isFinite(declared) && declared > 0
    ? declared
    : (Number(bounce.intensity) || 1.15);
  return bounce;
}

function applyNarrativeVisuals(refs, driver) {
  const sourceScale = readScaleY(refs.fireCore.scale, refs.fireCoreBaseScale.y) / refs.fireCoreBaseScale.y;
  const state = warRoomHansNarrativeFireState({
    phase: driver?.userData?.warRoomHansPhase,
    sourceScale,
  });

  driver.userData.warRoomHansFireNarrativePhase = state.narrativePhase;
  refs.fireplace.userData.warRoomHansFireNarrative = WAR_ROOM_HANS_FIRE_NARRATIVE_VERSION;
  refs.fireplace.userData.warRoomHansFireNarrativePhase = state.narrativePhase;

  if (state.mode === 'passthrough') {
    refs.fireCore.visible = true;
    return state;
  }

  refs.fireCore.visible = state.flameVisible;
  const widthScale = state.mode === 'cold' ? 0.42 : 0.42 + state.flameScale * 0.58;
  setScale(
    refs.fireCore.scale,
    refs.fireCoreBaseScale.x * widthScale,
    refs.fireCoreBaseScale.y * state.flameScale,
    refs.fireCoreBaseScale.z * widthScale,
  );
  refs.fireLight.intensity = refs.fireLightBaseIntensity * state.lightScale;
  refs.fireLight.distance = refs.fireLightBaseDistance * state.distanceScale;

  const bounce = resolveBounce(refs);
  if (bounce) bounce.intensity = refs.bounceBaseIntensity * state.bounceScale;
  return state;
}

export function installWarRoomHansFireNarrative(root) {
  if (!root) return 0;
  const driver = root.getObjectByName?.(HANS_DRIVER_NAME);
  const fireplace = root.getObjectByName?.(FIREPLACE_NAME);
  const fireCore = fireplace?.getObjectByName?.(FIRE_CORE_NAME);
  const fireLight = fireplace?.getObjectByName?.(FIRE_LIGHT_NAME);
  if (!driver || !fireplace || !fireCore || !fireLight || typeof driver.onBeforeRender !== 'function') return 0;
  if (!driver.userData?.warRoomHansQuickIteration) return 0;
  if (driver.userData.warRoomHansFireNarrative === WAR_ROOM_HANS_FIRE_NARRATIVE_VERSION) return 0;

  const original = driver.onBeforeRender;
  const refs = {
    fireplace,
    fireCore,
    fireLight,
    fireCoreBaseScale: {
      x: Number(fireCore.scale?.x || 1),
      y: readScaleY(fireCore.scale, 1),
      z: Number(fireCore.scale?.z || 1),
    },
    fireLightBaseIntensity: resolveBaseIntensity(fireLight, 1),
    fireLightBaseDistance: Number(fireLight.distance || 8.8),
    bounce: null,
    bounceBaseIntensity: 1.15,
  };

  driver.userData.warRoomHansFireNarrative = WAR_ROOM_HANS_FIRE_NARRATIVE_VERSION;
  driver.userData.warRoomHansFireNarrativePolicy = 'already-cold-then-rekindle-v1';

  // Quick iteration arms the old choreography at t=0 with a fully lit fire.
  // Override it immediately so the first painted frame already tells the right
  // story: Matthias is calling Hans because the hearth is cold, not because
  // Hans has somehow extinguished it by walking toward the room.
  applyNarrativeVisuals(refs, driver);

  driver.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    original(renderer, scene, camera, geometry, material, group);
    applyNarrativeVisuals(refs, driver);
  };

  return 1;
}
