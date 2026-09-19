import * as THREE from 'three';
import {
  clamp01,
  deriveMoveKinetics,
  easeOutCubic,
  inferCapturedPiece,
  smoothstep,
} from './WarRoom3DKinetics.js';
import {
  adaptiveRenderScale,
  nextRuntimeRenderScale,
  shadowRefreshInterval,
  shouldRefreshShadowMap,
} from './WarRoomRenderBudget.js';

export {
  adaptiveRenderScale,
  clamp01,
  deriveMoveKinetics,
  easeOutCubic,
  inferCapturedPiece,
  nextRuntimeRenderScale,
  shadowRefreshInterval,
  shouldRefreshShadowMap,
  smoothstep,
};

const WAR_ROOM_RENDER_DISCIPLINE = Symbol.for('chess-studio.war-room-render-discipline');
const shadowRefreshState = new WeakMap();
const warRoomHemisphereState = new WeakMap();
const warRoomKeyLightState = new WeakMap();
const warRoomWarmLightState = new WeakMap();
const warRoomMaterialGradeRootState = new WeakMap();
const warRoomMaterialGradeSignatureState = new WeakMap();
const warRoomMaterialGradeObjectIds = new WeakMap();
let nextWarRoomMaterialGradeObjectId = 1;

export function materialGradeRefreshInterval({ activeMotion = false } = {}) {
  // Historical cadence helper retained for compatibility with existing callers
  // and tests. The War Room render path no longer uses this timer: material
  // grading is invalidated by dynamic board structure changes instead.
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
  // Keep enough soft room fill to reveal wood, brass and pale surfaces without
  // erasing the directional modelling. Desktop gets a deliberate lift from the
  // old near-black ambient grade; touch keeps its established readability level.
  return coarsePointer ? 1.35 : 0.62;
}

export function applyWarRoomHemisphereGrade(scene, { coarsePointer = false } = {}) {
  if (!scene) return null;
  let hemisphere = warRoomHemisphereState.get(scene) || null;
  if (!hemisphere || !hemisphere.parent) {
    hemisphere = scene.children?.find((object) => (
      object?.isHemisphereLight
      && [0xffefd0, 0xffd8b0, 0xffe4c4].includes(object.color?.getHex?.())
      && [0x10192b, 0x1b120d].includes(object.groundColor?.getHex?.())
    )) || null;
    if (hemisphere) warRoomHemisphereState.set(scene, hemisphere);
  }
  if (!hemisphere) return null;
  hemisphere.intensity = warRoomHemisphereIntensity({ coarsePointer });
  if (typeof hemisphere.color?.setHex === 'function') hemisphere.color.setHex(0xffe4c4);
  if (typeof hemisphere.groundColor?.setHex === 'function') hemisphere.groundColor.setHex(0x1b120d);
  scene.userData.warRoomHemisphereIntensity = hemisphere.intensity;
  scene.userData.warRoomLightingGrade = 'warm-club-v2';
  return hemisphere;
}

export function warRoomLightingCoarsePointer({ budget = {}, mediaQuery = null } = {}) {
  const query = mediaQuery || (
    typeof globalThis !== 'undefined' && typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia.bind(globalThis)
      : null
  );
  if (query) {
    try {
      const result = query('(pointer: coarse)');
      if (typeof result?.matches === 'boolean') return result.matches;
    } catch {
      // A hostile/partial browser shim falls back to the historical render tier.
    }
  }
  return Number(budget?.shadowMapSize) <= 512;
}

export function warRoomV2RuntimeLightingProfile({ coarsePointer = false } = {}) {
  return {
    // The Blender review render already has the desired architectural depth.
    // Keep touch conservative, but let desktop preserve more of that authored
    // separation instead of crushing the shell back toward near-black.
    exposure: coarsePointer ? 1.0 : 1.12,
    hemisphere: coarsePointer ? 0.72 : 0.76,
    keyMax: coarsePointer ? 1.58 : 1.60,
    warmMax: coarsePointer ? 2.22 : 2.18,
    background: 0x0b0705,
    fog: 0x120b08,
    grade: 'nocturnal-walnut-v4',
  };
}

export function applyWarRoomV2RuntimeLightingGrade(
  scene,
  renderer,
  {
    coarsePointer = false,
    hemisphere = null,
    key = null,
    warmFill = null,
  } = {},
) {
  if (!scene || scene.userData?.warRoomRenderedVariant !== 'v2') return null;
  const profile = warRoomV2RuntimeLightingProfile({ coarsePointer });

  if (typeof scene.background?.setHex === 'function') scene.background.setHex(profile.background);
  if (scene.fog?.isFogExp2 && typeof scene.fog.color?.setHex === 'function') scene.fog.color.setHex(profile.fog);
  if (hemisphere) hemisphere.intensity = profile.hemisphere;
  if (key && Number.isFinite(key.intensity)) key.intensity = Math.min(key.intensity, profile.keyMax);
  if (warmFill && Number.isFinite(warmFill.intensity)) warmFill.intensity = Math.min(warmFill.intensity, profile.warmMax);
  if (renderer && 'toneMappingExposure' in renderer) renderer.toneMappingExposure = profile.exposure;

  scene.userData.warRoomV2LightingGrade = profile.grade;
  scene.userData.warRoomV2Exposure = profile.exposure;
  return profile;
}

export function warRoomAtmosphereProfile() {
  return {
    background: 0x100b08,
    fog: 0x17100c,
    grade: 'warm-amber-room-v2',
  };
}

export function applyWarRoomAtmosphereGrade(scene) {
  if (!scene) return null;
  const profile = warRoomAtmosphereProfile();
  if (typeof scene.background?.setHex === 'function') scene.background.setHex(profile.background);
  if (scene.fog?.isFogExp2 && typeof scene.fog.color?.setHex === 'function') scene.fog.color.setHex(profile.fog);
  scene.userData ||= {};
  scene.userData.warRoomAtmosphereGrade = profile.grade;
  scene.userData.warRoomBackgroundColor = profile.background;
  scene.userData.warRoomFogColor = profile.fog;
  return profile;
}

export function warRoomKeyLightPose({ whiteSide = true } = {}) {
  return {
    x: -6.4,
    y: 12.2,
    z: whiteSide ? 3.2 : -3.2,
  };
}

export function applyWarRoomKeyLightGrade(scene) {
  if (!scene) return null;
  let key = warRoomKeyLightState.get(scene) || null;
  if (!key || !key.parent) {
    key = scene.children?.find((object) => (
      object?.isDirectionalLight
      && [0xffe1aa, 0xffc58c, 0xffd8ac].includes(object.color?.getHex?.())
    )) || null;
    if (key) warRoomKeyLightState.set(scene, key);
  }
  if (!key) return null;

  // Keep the premium high-side modelling but move the key closer to clean warm
  // tungsten instead of dense orange. The extra luminance comes from the light
  // profile and ambient lift, not from tinting every surface amber.
  const whiteSide = (Number(key.position?.z) || 0) >= 0;
  const pose = warRoomKeyLightPose({ whiteSide });
  if (typeof key.position?.set === 'function') key.position.set(pose.x, pose.y, pose.z);
  else if (key.position) Object.assign(key.position, pose);
  if (typeof key.color?.setHex === 'function') key.color.setHex(0xffd8ac);

  scene.userData ||= {};
  scene.userData.warRoomKeyLightPose = 'high-side-v1';
  scene.userData.warRoomKeyLightPosition = pose;
  scene.userData.warRoomLightingGrade = 'warm-club-v2';
  return key;
}

export function warRoomWarmFillPose({ whiteSide = true } = {}) {
  return {
    x: -5.0,
    y: 3.6,
    z: whiteSide ? 3.15 : -3.15,
  };
}

export function applyWarRoomWarmFillGrade(scene) {
  if (!scene) return null;
  let warm = warRoomWarmLightState.get(scene) || null;
  if (!warm || !warm.parent) {
    warm = scene.children?.find((object) => (
      object?.isPointLight
      && [0xffa449, 0xffb45f].includes(object.color?.getHex?.())
    )) || null;
    if (warm) warRoomWarmLightState.set(scene, warm);
  }
  if (!warm) return null;

  // The theme-colored rim already lives behind the opponent rank. Pull the
  // existing warm practical closer to the player's outer quarter so the ivory
  // receives a broader lateral graze instead of flat front fill. Use a softer
  // amber than the old orange practical so wood and brass glow without a sepia veil.
  let key = warRoomKeyLightState.get(scene) || null;
  if (!key || !key.parent) {
    key = scene.children?.find((object) => (
      object?.isDirectionalLight
      && [0xffe1aa, 0xffc58c, 0xffd8ac].includes(object.color?.getHex?.())
    )) || null;
    if (key) warRoomKeyLightState.set(scene, key);
  }
  const keyZ = Number(scene.userData?.warRoomKeyLightPosition?.z ?? key?.position?.z) || 0;
  const pose = warRoomWarmFillPose({ whiteSide: keyZ >= 0 });
  if (typeof warm.position?.set === 'function') warm.position.set(pose.x, pose.y, pose.z);
  else if (warm.position) Object.assign(warm.position, pose);
  if (typeof warm.color?.setHex === 'function') warm.color.setHex(0xffb45f);

  scene.userData ||= {};
  scene.userData.warRoomRankSeparation = 'lateral-graze-ranks-v3';
  scene.userData.warRoomWarmFillPosition = pose;
  return warm;
}

export function warRoomMaterialIblProfile({ coarsePointer = false } = {}) {
  if (coarsePointer) return null;
  return {
    ivoryEnvMax: 0.07,
    lightTileEnvMax: 0.24,
    ivoryRoughnessMin: 0.92,
    ivoryClearcoatMax: 0.02,
    ivoryClearcoatRoughnessMin: 0.86,
    ivorySpecularMax: 0.05,
    ivorySheenMax: 0.003,
    ivorySheenRoughnessMin: 0.92,
    ivoryAlbedoScale: 0.78,
    lightTileRoughnessMin: 0.8,
    lightTileClearcoatMax: 0.1,
    lightTileClearcoatRoughnessMin: 0.56,
    lightTileSpecularMax: 0.26,
    lightTileAlbedoScale: 0.92,
    // Current Board3DSurfaces tiles carry a version marker. In the War Room they
    // should keep a luminous satin response instead of being pushed through the
    // legacy matte compatibility grade below.
    canonicalLightTileEnvMin: 0.08,
    canonicalLightTileRoughnessMax: 0.7,
    canonicalLightTileClearcoatMin: 0.18,
    canonicalLightTileClearcoatRoughnessMax: 0.36,
    canonicalLightTileSpecularMin: 0.38,
  };
}

function applyStableAlbedoScale(material, scale, grade, targetHex = null, blendAmount = 0) {
  if (!material?.color?.getHex || typeof material.color.copy !== 'function') return false;
  material.userData ||= {};

  const currentHex = material.color.getHex();
  const previous = material.userData.warRoomAlbedoGradeState;
  const sourceHex = previous?.gradedHex === currentHex && Number.isFinite(previous?.sourceHex)
    ? previous.sourceHex
    : currentHex;
  const gradedColor = new THREE.Color(sourceHex).multiplyScalar(scale);
  const blend = clamp01(blendAmount);
  if (targetHex != null && blend > 0) {
    // Blend toward a concrete warm-ivory target instead of relying on tiny RGB
    // attenuation deltas that can disappear under tone mapping and practical lights.
    gradedColor.lerp(new THREE.Color(targetHex), blend);
  }
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

function materialGradeTraversalRoot(scene) {
  const cached = warRoomMaterialGradeRootState.get(scene);
  if (cached?.parent) return cached;

  let boardRoot = null;
  scene?.traverse?.((object) => {
    if (boardRoot || !object?.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some((material) => material?.userData?.surfaceRole === 'board-light')) {
      boardRoot = object.parent || null;
    }
  });

  if (boardRoot) {
    warRoomMaterialGradeRootState.set(scene, boardRoot);
    scene.userData ||= {};
    scene.userData.warRoomMaterialGradeTraversal = 'board-root-v1';
    return boardRoot;
  }

  scene.userData ||= {};
  scene.userData.warRoomMaterialGradeTraversal = 'scene-fallback';
  return scene;
}

function materialGradeObjectIdentity(object) {
  if (!object || (typeof object !== 'object' && typeof object !== 'function')) return 0;
  let identity = warRoomMaterialGradeObjectIds.get(object);
  if (!identity) {
    identity = nextWarRoomMaterialGradeObjectId;
    nextWarRoomMaterialGradeObjectId += 1;
    warRoomMaterialGradeObjectIds.set(object, identity);
  }
  return identity;
}

export function warRoomMaterialGradeDynamicSignature(root) {
  if (!root?.children) return '';
  return root.children
    .filter((child) => child?.isGroup)
    .map((group) => {
      const children = group.children || [];
      const first = children[0] || null;
      const last = children.length ? children[children.length - 1] : null;
      return [
        materialGradeObjectIdentity(group),
        children.length,
        materialGradeObjectIdentity(first),
        materialGradeObjectIdentity(last),
      ].join(':');
    })
    .join('|');
}

export function shouldRunWarRoomMaterialGrade(scene) {
  if (!scene) return false;
  const traversalRoot = materialGradeTraversalRoot(scene);
  if (!traversalRoot) return false;

  // If the canonical board root cannot be resolved, keep the old safe behavior.
  // Normal War Room scenes resolve it on the first render because board tiles are
  // already mounted before painting starts.
  if (traversalRoot === scene && scene.userData?.warRoomMaterialGradeTraversal === 'scene-fallback') {
    return true;
  }

  const signature = warRoomMaterialGradeDynamicSignature(traversalRoot);
  const previous = warRoomMaterialGradeSignatureState.get(scene);
  if (previous === signature) return false;

  warRoomMaterialGradeSignatureState.set(scene, signature);
  scene.userData ||= {};
  scene.userData.warRoomMaterialGradeMode = 'dynamic-groups-v1';
  scene.userData.warRoomMaterialGradeInvalidations = (scene.userData.warRoomMaterialGradeInvalidations || 0) + 1;
  return true;
}

export function applyWarRoomMaterialGrade(scene, { coarsePointer = false } = {}) {
  const profile = warRoomMaterialIblProfile({ coarsePointer });
  if (!scene || !profile || typeof scene.traverse !== 'function') {
    return { adjusted: 0, ivory: 0, canonicalIvory: 0, lightTile: 0, canonicalLightTile: 0, profile };
  }

  const traversalRoot = materialGradeTraversalRoot(scene);
  if (!traversalRoot || typeof traversalRoot.traverse !== 'function') {
    return { adjusted: 0, ivory: 0, canonicalIvory: 0, lightTile: 0, canonicalLightTile: 0, profile };
  }

  const seen = new Set();
  let adjusted = 0;
  let ivory = 0;
  let canonicalIvory = 0;
  let lightTile = 0;
  let canonicalLightTile = 0;

  traversalRoot.traverse((object) => {
    if (!object?.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || seen.has(material)) continue;
      seen.add(material);

      const role = material.userData?.surfaceRole;
      if (role !== 'ivory' && role !== 'board-light') continue;
      material.userData ||= {};

      // Board3DSurfaces owns the PBR contract for current materials. Versioned
      // ivory stays untouched, while versioned light tiles get a War Room-specific
      // satin lift so the approved warm lighting keeps depth instead of reading as
      // an opaque matte wash. Unversioned materials remain on the compatibility
      // path below for old/custom surfaces.
      if (role === 'ivory' && material.userData.surfaceVersion) {
        ivory += 1;
        canonicalIvory += 1;
        continue;
      }
      if (role === 'board-light' && material.userData.surfaceVersion) {
        lightTile += 1;
        canonicalLightTile += 1;
        let changed = false;
        changed = floorMaterial(material, 'envMapIntensity', profile.canonicalLightTileEnvMin) || changed;
        changed = capMaterial(material, 'roughness', profile.canonicalLightTileRoughnessMax) || changed;
        changed = floorMaterial(material, 'clearcoat', profile.canonicalLightTileClearcoatMin) || changed;
        changed = capMaterial(material, 'clearcoatRoughness', profile.canonicalLightTileClearcoatRoughnessMax) || changed;
        changed = floorMaterial(material, 'specularIntensity', profile.canonicalLightTileSpecularMin) || changed;
        material.userData.warRoomSurfaceGrade = 'luminous-light-tile-v1';
        material.userData.warRoomIblGrade = 'luminous-satin-v1';
        if (changed) adjusted += 1;
        continue;
      }

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
        changed = applyStableAlbedoScale(material, profile.ivoryAlbedoScale, 'aged-ivory-v2', 0xcbb286, 0.72) || changed;
        material.userData.warRoomSurfaceGrade = 'aged-ivory-v2';
      } else {
        lightTile += 1;
        changed = capMaterial(material, 'envMapIntensity', profile.lightTileEnvMax) || changed;
        changed = floorMaterial(material, 'roughness', profile.lightTileRoughnessMin) || changed;
        changed = capMaterial(material, 'clearcoat', profile.lightTileClearcoatMax) || changed;
        changed = floorMaterial(material, 'clearcoatRoughness', profile.lightTileClearcoatRoughnessMin) || changed;
        changed = capMaterial(material, 'specularIntensity', profile.lightTileSpecularMax) || changed;
        changed = applyStableAlbedoScale(material, profile.lightTileAlbedoScale, 'muted-light-tile-v2', 0xe8d7b8, 0.38) || changed;
        material.userData.warRoomSurfaceGrade = 'muted-light-tile-v2';
      }

      material.userData.warRoomIblGrade = 'low-fill-v2';
      if (changed) adjusted += 1;
    }
  });

  scene.userData.warRoomMaterialIblProfile = 'low-fill-v2';
  scene.userData.warRoomSurfaceGrade = canonicalLightTile > 0 ? 'luminous-satin-v1' : 'aged-matte-v2';
  scene.userData.warRoomIvoryEnvMax = profile.ivoryEnvMax;
  scene.userData.warRoomLightTileEnvMax = profile.lightTileEnvMax;
  scene.userData.warRoomCanonicalIvoryProtected = canonicalIvory;
  scene.userData.warRoomCanonicalLightTile = canonicalLightTile;
  scene.userData.warRoomMaterialIblAdjusted = adjusted;
  scene.userData.warRoomMaterialGradePasses = (scene.userData.warRoomMaterialGradePasses || 0) + 1;
  return { adjusted, ivory, canonicalIvory, lightTile, canonicalLightTile, profile };
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

    const renderLite = Number(budget.shadowMapSize) <= 512;
    const lightingCoarsePointer = warRoomLightingCoarsePointer({ budget });
    const atmosphere = applyWarRoomAtmosphereGrade(scene);
    if (atmosphere && this.domElement?.dataset) {
      this.domElement.dataset.warRoomAtmosphereGrade = atmosphere.grade;
    }
    const hemisphere = applyWarRoomHemisphereGrade(scene, { coarsePointer: lightingCoarsePointer });
    if (hemisphere && this.domElement?.dataset) {
      this.domElement.dataset.warRoomLightHemisphere = Number(hemisphere.intensity).toFixed(2);
    }
    const boardKey = applyWarRoomKeyLightGrade(scene);
    if (boardKey && this.domElement?.dataset) {
      this.domElement.dataset.warRoomKeyLightPose = 'high-side-v1';
      this.domElement.dataset.warRoomLightingGrade = 'warm-club-v2';
    }
    const warmFill = applyWarRoomWarmFillGrade(scene);
    if (warmFill && this.domElement?.dataset) {
      this.domElement.dataset.warRoomRankSeparation = 'lateral-graze-ranks-v3';
    }
    const v2Lighting = applyWarRoomV2RuntimeLightingGrade(scene, this, {
      coarsePointer: lightingCoarsePointer,
      hemisphere,
      key: boardKey,
      warmFill,
    });
    if (v2Lighting && this.domElement?.dataset) {
      this.domElement.dataset.warRoomV2LightingGrade = v2Lighting.grade;
      this.domElement.dataset.warRoomV2Exposure = Number(v2Lighting.exposure).toFixed(2);
    }
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    const state = shadowRefreshState.get(this) || {
      lastShadowAt: Number.NEGATIVE_INFINITY,
      lastRenderAt: Number.NaN,
      slowFrameCount: 0,
    };
    shadowRefreshState.set(this, state);

    const frameMs = Number.isFinite(state.lastRenderAt) ? now - state.lastRenderAt : 16;
    const activeMotion = Number.isFinite(state.lastRenderAt) && frameMs < 50;
    state.lastRenderAt = now;

    if (shouldRunWarRoomMaterialGrade(scene)) {
      const materialGrade = applyWarRoomMaterialGrade(scene, { coarsePointer: renderLite });
      if (materialGrade.profile && this.domElement?.dataset) {
        this.domElement.dataset.warRoomIblIvory = Number(materialGrade.profile.ivoryEnvMax).toFixed(2);
        this.domElement.dataset.warRoomIblLightTile = Number(materialGrade.profile.lightTileEnvMax).toFixed(2);
        this.domElement.dataset.warRoomSurfaceGrade = scene.userData?.warRoomSurfaceGrade || 'aged-matte-v2';
        this.domElement.dataset.warRoomMaterialGrade = 'dynamic-groups-v1';
        this.domElement.dataset.warRoomCanonicalIvoryProtected = String(materialGrade.canonicalIvory || 0);
      }
    }

    const currentScale = typeof this.getPixelRatio === 'function'
      ? this.getPixelRatio()
      : Number(budget.pixelRatio) || 1;
    const runtime = nextRuntimeRenderScale({
      currentScale,
      frameMs,
      slowFrameCount: state.slowFrameCount,
      coarsePointer: renderLite,
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
      coarsePointer: renderLite,
      activeMotion,
    })) {
      this.shadowMap.needsUpdate = true;
      state.lastShadowAt = now;
    }

    return originalRender.call(this, scene, camera);
  };
}

installWarRoomRenderDiscipline();

export function reactiveLightProfile({ check = false, gameOver = false, coarsePointer = false } = {}) {
  // The room now carries more of the warm luminous grade globally. Keep the
  // special-state changes readable without letting them drag the whole room back
  // into the old dim blue-grey presentation.
  const baseExposure = coarsePointer ? 1.04 : 1.16;
  if (gameOver) {
    return {
      key: coarsePointer ? 1.62 : 1.46,
      rim: coarsePointer ? 6.4 : 3.0,
      warm: coarsePointer ? 3.1 : 1.6,
      exposure: baseExposure - 0.06,
      fogDensity: coarsePointer ? 0.0185 : 0.0175,
    };
  }
  if (check) {
    return {
      key: coarsePointer ? 2.35 : 1.98,
      rim: coarsePointer ? 15.2 : 7.2,
      warm: coarsePointer ? 4.9 : 2.5,
      exposure: baseExposure + 0.01,
      fogDensity: coarsePointer ? 0.0165 : 0.0148,
    };
  }
  return {
    key: coarsePointer ? 2.02 : 1.72,
    rim: coarsePointer ? 12.6 : 5.8,
    warm: coarsePointer ? 5.0 : 2.45,
    exposure: baseExposure,
    fogDensity: coarsePointer ? 0.0155 : 0.0132,
  };
}
