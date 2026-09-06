import * as THREE from 'three';

const WAR_ROOM_RENDER_DISCIPLINE = Symbol.for('chess-studio.war-room-render-discipline');
const shadowRefreshState = new WeakMap();
const warRoomHemisphereState = new WeakMap();

export function shadowRefreshInterval({ coarsePointer = false, activeMotion = false } = {}) {
  if (activeMotion) return coarsePointer ? 180 : 120;
  return coarsePointer ? 540 : 360;
}

export function shouldRefreshShadowMap({
  now = 0,
  lastShadowAt = Number.NEGATIVE_INFINITY,
  coarsePointer = false,
  activeMotion = false,
} = {}) {
  const current = Number(now);
  const previous = Number(lastShadowAt);
  if (!Number.isFinite(previous)) return true;
  if (!Number.isFinite(current)) return false;
  return current - previous >= shadowRefreshInterval({ coarsePointer, activeMotion });
}

export function materialGradeRefreshInterval({ activeMotion = false } = {}) {
  // Material grading traverses the complete scene graph. It is worth keeping the
  // tight cadence while pieces are actually moving, but repeating that traversal
  // five times a second while the room merely breathes is pure idle CPU work.
  return activeMotion ? 180 : 1500;
}

export function shouldRefreshMaterialGrade({
  now = 0,
  lastMaterialGradeAt = Number.NEGATIVE_INFINITY,
  activeMotion = false,
} = {}) {
  const current = Number(now);
  const previous = Number(lastMaterialGradeAt);
  if (!Number.isFinite(previous)) return true;
  if (!Number.isFinite(current)) return false;
  return current - previous >= materialGradeRefreshInterval({ activeMotion });
}

export function warRoomHemisphereIntensity({ coarsePointer = false } = {}) {
  // Keep the darker desktop grade, but preserve enough global fill for the room
  // architecture, armor and board surround to remain readable around the practicals.
  // Touch/coarse devices keep their established brighter readability contract.
  return coarsePointer ? 1.35 : 1.24;
}

export function applyWarRoomHemisphereGrade(scene, { coarsePointer = false } = {}) {
  if (!scene) return null;
  let hemisphere = warRoomHemisphereState.get(scene) || null;
  if (!hemisphere || !hemisphere.parent) {
    hemisphere = scene.children?.find((object) => (
      object?.isHemisphereLight
      && object.color?.getHex?.() === 0xffefd0
      && object.groundColor?.getHex?.() === 0x10192b
    )) || null;
    if (hemisphere) warRoomHemisphereState.set(scene, hemisphere);
  }
  if (!hemisphere) return null;
  hemisphere.intensity = warRoomHemisphereIntensity({ coarsePointer });
  scene.userData.warRoomHemisphereIntensity = hemisphere.intensity;
  return hemisphere;
}

export function warRoomMaterialIblProfile({ coarsePointer = false } = {}) {
  if (coarsePointer) return null;
  return {
    ivoryEnvMax: 0.18,
    lightTileEnvMax: 0.24,
    ivoryRoughnessMin: 0.74,
    ivoryClearcoatMax: 0.12,
    ivoryClearcoatRoughnessMin: 0.58,
    ivorySpecularMax: 0.18,
    ivorySheenMax: 0.015,
    ivorySheenRoughnessMin: 0.72,
    ivoryAlbedoScale: 0.88,
    lightTileRoughnessMin: 0.8,
    lightTileClearcoatMax: 0.1,
    lightTileClearcoatRoughnessMin: 0.56,
    lightTileSpecularMax: 0.26,
    lightTileAlbedoScale: 0.92,
  };
}

function applyStableAlbedoScale(material, scale, grade) {
  if (!material?.color?.getHex || typeof material.color.copy !== 'function') return false;
  material.userData ||= {};

  const currentHex = material.color.getHex();
  const previous = material.userData.warRoomAlbedoGradeState;
  const sourceHex = previous?.grade === grade && previous.gradedHex === currentHex
    ? previous.sourceHex
    : currentHex;
  const gradedColor = new THREE.Color(sourceHex).multiplyScalar(scale);
  const gradedHex = gradedColor.getHex();

  material.userData.warRoomAlbedoGradeState = { grade, sourceHex, gradedHex };
  if (gradedHex === currentHex) return false;
  material.color.copy(gradedColor);
  return true;
}

function capMaterial(material, key, maximum) {
  if (typeof material?.[key] !== 'number' || material[key] <= maximum) return false;
  material[key] = maximum;
  return true;
}

function floorMaterial(material, key, minimum) {
  if (typeof material?.[key] !== 'number' || material[key] >= minimum) return false;
  material[key] = minimum;
  return true;
}

export function applyWarRoomMaterialGrade(scene, { coarsePointer = false } = {}) {
  const profile = warRoomMaterialIblProfile({ coarsePointer });
  if (!scene || !profile || typeof scene.traverse !== 'function') {
    return { adjusted: 0, ivory: 0, lightTile: 0, profile };
  }

  const seen = new Set();
  let adjusted = 0;
  let ivory = 0;
  let lightTile = 0;

  scene.traverse((object) => {
    if (!object?.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || seen.has(material)) continue;
      seen.add(material);

      const role = material.userData?.surfaceRole;
      if (role !== 'ivory' && role !== 'board-light') continue;
      material.userData ||= {};

      let changed = false;
      if (role === 'ivory') {
        ivory += 1;
        changed = capMaterial(material, 'envMapIntensity', profile.ivoryEnvMax) || changed;
        changed = floorMaterial(material, 'roughness', profile.ivoryRoughnessMin) || changed;
        changed = capMaterial(material, 'clearcoat', profile.ivoryClearcoatMax) || changed;
        changed = floorMaterial(material, 'clearcoatRoughness', profile.ivoryClearcoatRoughnessMin) || changed;
        changed = capMaterial(material, 'specularIntensity', profile.ivorySpecularMax) || changed;
        changed = capMaterial(material, 'sheen', profile.ivorySheenMax) || changed;
        changed = floorMaterial(material, 'sheenRoughness', profile.ivorySheenRoughnessMin) || changed;
        changed = applyStableAlbedoScale(material, profile.ivoryAlbedoScale, 'aged-ivory-v2') || changed;
        material.userData.warRoomSurfaceGrade = 'aged-ivory-v2';
      } else {
        lightTile += 1;
        changed = capMaterial(material, 'envMapIntensity', profile.lightTileEnvMax) || changed;
        changed = floorMaterial(material, 'roughness', profile.lightTileRoughnessMin) || changed;
        changed = capMaterial(material, 'clearcoat', profile.lightTileClearcoatMax) || changed;
        changed = floorMaterial(material, 'clearcoatRoughness', profile.lightTileClearcoatRoughnessMin) || changed;
        changed = capMaterial(material, 'specularIntensity', profile.lightTileSpecularMax) || changed;
        changed = applyStableAlbedoScale(material, profile.lightTileAlbedoScale, 'muted-light-tile-v2') || changed;
        material.userData.warRoomSurfaceGrade = 'muted-light-tile-v2';
      }

      material.userData.warRoomIblGrade = 'low-fill-v2';
      if (changed) adjusted += 1;
    }
  });

  scene.userData.warRoomMaterialIblProfile = 'low-fill-v2';
  scene.userData.warRoomSurfaceGrade = 'aged-matte-v2';
  scene.userData.warRoomIvoryEnvMax = profile.ivoryEnvMax;
  scene.userData.warRoomLightTileEnvMax = profile.lightTileEnvMax;
  scene.userData.warRoomMaterialIblAdjusted = adjusted;
  return { adjusted, ivory, lightTile, profile };
}

export function nextRuntimeRenderScale({
  currentScale = 1,
  frameMs = 16,
  slowFrameCount = 0,
  coarsePointer = false,
} = {}) {
  const current = Math.max(0.5, Number(currentScale) || 1);
  const dt = Number(frameMs);
  const minimum = coarsePointer ? 0.75 : 0.9;
  let slow = Math.max(0, Number(slowFrameCount) || 0);

  // Ignore sparse UI renders: a 150 ms gap between two clicks is not a 6 FPS GPU.
  // Only contiguous frame cadence is useful for deciding that the renderer is hot.
  if (!Number.isFinite(dt) || dt <= 0 || dt >= 80) slow = 0;
  else if (dt > 24) slow += 1;
  else slow = Math.max(0, slow - 1);

  if (slow < 5 || current <= minimum + 0.01) {
    return { scale: current, slowFrameCount: slow, downgraded: false };
  }

  const step = coarsePointer ? 0.15 : 0.2;
  const scale = Math.max(minimum, Math.round((current - step) * 100) / 100);
  return { scale, slowFrameCount: 0, downgraded: scale < current };
}

function installWarRoomRenderDiscipline() {
  const prototype = THREE.WebGLRenderer?.prototype;
  if (!prototype || prototype[WAR_ROOM_RENDER_DISCIPLINE]) return;

  const originalRender = prototype.render;
  Object.defineProperty(prototype, WAR_ROOM_RENDER_DISCIPLINE, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  prototype.render = function renderWithWarRoomShadowBudget(scene, camera) {
    const budget = scene?.userData?.warRoomRenderBudget;
    if (!budget || !this.shadowMap) return originalRender.call(this, scene, camera);

    const coarsePointer = Number(budget.shadowMapSize) <= 512;
    const hemisphere = applyWarRoomHemisphereGrade(scene, { coarsePointer });
    if (hemisphere && this.domElement?.dataset) {
      this.domElement.dataset.warRoomLightHemisphere = Number(hemisphere.intensity).toFixed(2);
    }
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    const state = shadowRefreshState.get(this) || {
      lastShadowAt: Number.NEGATIVE_INFINITY,
      lastRenderAt: Number.NaN,
      lastMaterialGradeAt: Number.NEGATIVE_INFINITY,
      slowFrameCount: 0,
    };
    shadowRefreshState.set(this, state);

    const frameMs = Number.isFinite(state.lastRenderAt) ? now - state.lastRenderAt : 16;
    const activeMotion = Number.isFinite(state.lastRenderAt) && frameMs < 50;
    state.lastRenderAt = now;

    if (shouldRefreshMaterialGrade({
      now,
      lastMaterialGradeAt: state.lastMaterialGradeAt,
      activeMotion,
    })) {
      const materialGrade = applyWarRoomMaterialGrade(scene, { coarsePointer });
      state.lastMaterialGradeAt = now;
      if (materialGrade.profile && this.domElement?.dataset) {
        this.domElement.dataset.warRoomIblIvory = Number(materialGrade.profile.ivoryEnvMax).toFixed(2);
        this.domElement.dataset.warRoomIblLightTile = Number(materialGrade.profile.lightTileEnvMax).toFixed(2);
        this.domElement.dataset.warRoomSurfaceGrade = 'aged-matte-v2';
      }
    }

    const currentScale = typeof this.getPixelRatio === 'function'
      ? this.getPixelRatio()
      : Number(budget.pixelRatio) || 1;
    const runtime = nextRuntimeRenderScale({
      currentScale,
      frameMs,
      slowFrameCount: state.slowFrameCount,
      coarsePointer,
    });
    state.slowFrameCount = runtime.slowFrameCount;
    if (runtime.downgraded && typeof this.setPixelRatio === 'function') {
      this.setPixelRatio(runtime.scale);
      scene.userData.warRoomRuntimeScale = runtime.scale;
    }

    // The scene can keep its premium ambient heartbeat without paying the full
    // directional-shadow pass on every idle paint. Contiguous motion restores the
    // tighter cadence so piece movement still gets responsive real shadows.
    this.shadowMap.autoUpdate = false;
    if (shouldRefreshShadowMap({
      now,
      lastShadowAt: state.lastShadowAt,
      coarsePointer,
      activeMotion,
    })) {
      this.shadowMap.needsUpdate = true;
      state.lastShadowAt = now;
    }

    return originalRender.call(this, scene, camera);
  };
}

installWarRoomRenderDiscipline();

export function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

export function easeOutCubic(value) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

export function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function inferCapturedPiece(previousPieces = [], nextPieces = [], animate = null) {
  if (!animate?.capture || !animate?.from || !animate?.to) return null;
  const mover = previousPieces.find((piece) => piece.square === animate.from) || null;
  if (!mover) return null;
  const direct = previousPieces.find((piece) => piece.square === animate.to && piece.color !== mover.color);
  if (direct) return direct;
  return previousPieces.find((piece) => {
    if (piece.square === animate.from || piece.color === mover.color) return false;
    return !nextPieces.some((next) => next.square === piece.square && next.color === piece.color && next.type === piece.type);
  }) || null;
}

export function deriveMoveKinetics({ movingType = 'p', capture = false, promotion = false, castling = false, coarsePointer = false } = {}) {
  const type = String(movingType || 'p').toLowerCase();
  const duration = coarsePointer ? (capture ? 200 : 170) : (capture ? 240 : type === 'n' ? 220 : 190);
  const lift = coarsePointer ? 0.08 : type === 'n' ? 0.28 : capture ? 0.19 : 0.13;
  return {
    duration,
    lift,
    impactStart: capture ? 0.48 : 1,
    captureTilt: capture ? 0.78 : 0,
    promotionPulse: promotion ? 0.085 : 0,
    rookDelay: castling ? 0.16 : 0,
  };
}

export function reactiveLightProfile({ check = false, gameOver = false, coarsePointer = false } = {}) {
  // Fine tuning after live visual review: keep room practicals and global exposure
  // untouched, and lower only the desktop directional key one modest notch. The
  // render boundary separately normalizes the fixed hemisphere fill that was masking
  // this key reduction on ivory pieces and light tiles.
  const baseExposure = coarsePointer ? 1.005 : 1.04;
  if (gameOver) {
    return {
      key: coarsePointer ? 1.52 : 1.26,
      rim: coarsePointer ? 7.1 : 6.8,
      warm: coarsePointer ? 3.0 : 2.75,
      exposure: baseExposure - 0.075,
      fogDensity: coarsePointer ? 0.0215 : 0.0225,
    };
  }
  if (check) {
    return {
      key: coarsePointer ? 2.32 : 1.74,
      rim: coarsePointer ? 16.8 : 16.4,
      warm: coarsePointer ? 4.9 : 4.55,
      exposure: baseExposure + 0.005,
      fogDensity: coarsePointer ? 0.019 : 0.0192,
    };
  }
  return {
    key: coarsePointer ? 1.99 : 1.42,
    rim: coarsePointer ? 12.6 : 12.15,
    warm: coarsePointer ? 5.0 : 4.85,
    exposure: baseExposure,
    fogDensity: coarsePointer ? 0.0178 : 0.0172,
  };
}

export function adaptiveRenderScale({ coarsePointer = false, slowFrameCount = 0 } = {}) {
  // Animation is the hottest path: moving geometry, transparency and reactive
  // lighting all converge here. Keep the static War Room crisp, but drop the
  // animation budget one notch before frame loss becomes visible.
  if (coarsePointer) return slowFrameCount >= 4 ? 0.75 : 1;
  return slowFrameCount >= 4 ? 0.9 : 1.2;
}
