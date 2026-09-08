import * as THREE from 'three';
import { squarePosition } from './Board3DBoardMath.js';
import { consumeWarRoomMoveFinishEvent } from './WarRoomMoveFinishEvent.js';

const EPSILON = 0.002;

const BODY_PROFILES = Object.freeze({
  p: Object.freeze({ lean: 0.052, anticipationLean: 0.018, compression: 0.018, landing: 0.014, airborneStretch: 0.004, sway: 0, brake: 0.012, rebound: 0.006 }),
  n: Object.freeze({ lean: 0.105, anticipationLean: -0.032, compression: 0.058, landing: 0.048, airborneStretch: 0.038, sway: 0.009, brake: 0.020, rebound: 0.055 }),
  b: Object.freeze({ lean: 0.036, anticipationLean: 0.006, compression: 0.008, landing: 0.010, airborneStretch: 0.008, sway: 0.020, brake: 0.010, rebound: 0.008 }),
  r: Object.freeze({ lean: 0.023, anticipationLean: -0.014, compression: 0.038, landing: 0.046, airborneStretch: 0.002, sway: 0, brake: 0.040, rebound: 0.010 }),
  q: Object.freeze({ lean: 0.030, anticipationLean: 0.006, compression: 0.006, landing: 0.008, airborneStretch: 0.010, sway: 0.005, brake: 0.007, rebound: 0.006 }),
  k: Object.freeze({ lean: 0.017, anticipationLean: -0.006, compression: 0.022, landing: 0.030, airborneStretch: 0.003, sway: 0, brake: 0.024, rebound: 0.008 }),
});

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function bell(start, peak, end, progress) {
  const p = clamp01(progress);
  if (p <= start || p >= end) return 0;
  if (p <= peak) return smoothstep(start, peak, p);
  return 1 - smoothstep(peak, end, p);
}

export function derivePromotionMorph({ progress = 0, coarsePointer = false } = {}) {
  const p = clamp01(progress);
  const amplitude = coarsePointer ? 0.62 : 1;
  const collapse = smoothstep(0.78, 0.96, p);
  const emerge = smoothstep(0.82, 0.97, p);
  const seal = bell(0.91, 0.97, 0.999, p);

  return {
    pawnOpacity: 1 - smoothstep(0.82, 0.96, p),
    promotedOpacity: smoothstep(0.84, 0.97, p),
    pawnScaleY: 1 - collapse * 0.20 * amplitude,
    pawnScaleXZ: 1 + collapse * 0.07 * amplitude,
    pawnYOffset: -collapse * 0.018 * amplitude,
    promotedScale: 0.80 + emerge * 0.20 + seal * 0.035 * amplitude,
    promotedYOffset: -(1 - emerge) * 0.035 * amplitude + seal * 0.012 * amplitude,
    seal,
  };
}

export function derivePieceBodyPose({
  type = 'p',
  progress = 0,
  dx = 0,
  dz = 0,
  airborne = 0,
  travelDistance = 0,
  promotionEnergy = 0,
  checkmateFinish = false,
  castlingRole = '',
  coarsePointer = false,
} = {}) {
  const normalizedType = String(type || 'p').toLowerCase();
  const profile = BODY_PROFILES[normalizedType] || BODY_PROFILES.p;
  const p = clamp01(progress);
  const air = clamp01(airborne);
  const amplitude = coarsePointer ? 0.60 : 1;
  const distance = Math.hypot(dx, dz);
  const ux = distance > EPSILON ? dx / distance : 0;
  const uz = distance > EPSILON ? dz / distance : 0;
  const explicitCastleKing = castlingRole === 'king' && normalizedType === 'k';
  const explicitCastleRook = castlingRole === 'rook' && normalizedType === 'r';
  const inferredCastleKing = normalizedType === 'k' && Number(travelDistance) > 1.5;
  const castleKing = explicitCastleKing || inferredCastleKing;

  const anticipation = 1 - smoothstep(0, 0.18, p);
  const transit = Math.sin(Math.PI * p);
  const landingPhase = clamp01((p - 0.68) / 0.32);
  const landing = p > 0.68 ? Math.sin(Math.PI * landingPhase) : 0;
  const braking = bell(0.58, 0.78, 0.96, p);
  const rebound = bell(0.80, 0.91, 0.995, p);
  const mateSeal = checkmateFinish ? bell(0.70, 0.90, 0.998, p) * amplitude : 0;
  const castleResponse = explicitCastleRook ? 1 - smoothstep(0.02, 0.24, p) : 0;
  const castleLock = (explicitCastleKing || explicitCastleRook) ? bell(0.70, 0.90, 0.998, p) : 0;
  const castleResponseLoad = castleResponse * 0.026 * amplitude;
  const castleLockLoad = castleLock * 0.014 * amplitude;
  const diagonalPawnCapture = normalizedType === 'p' && Math.abs(ux) > 0.25 && Math.abs(uz) > 0.25;
  const captureDrive = diagonalPawnCapture ? bell(0.32, 0.67, 0.92, p) * 0.060 * amplitude : 0;
  const castleBrace = castleKing
    ? bell(0.08, 0.48, 0.90, p) * 0.020 * amplitude
    : 0;
  const promotion = clamp01(promotionEnergy) * amplitude;

  const sway = profile.sway * Math.sin(Math.PI * 2 * p) * amplitude;
  const transitLean = profile.lean * transit;
  const anticipationLean = profile.anticipationLean * anticipation;
  const brakeLean = profile.brake * braking;
  const mateLean = mateSeal * 0.016;
  const castleResponseLean = castleResponseLoad * 0.46;
  const lean = (transitLean + anticipationLean - brakeLean) * amplitude - mateLean - castleResponseLean;
  const compression = (profile.compression * anticipation + profile.landing * landing) * amplitude
    + castleResponseLoad * 0.62
    + castleLockLoad;
  const stretch = profile.airborneStretch * air * transit * amplitude;
  const reboundLift = profile.rebound * rebound * amplitude;
  const castleDirection = ux >= 0 ? -1 : 1;

  return {
    pitch: uz * lean + ux * sway,
    roll: -ux * lean + uz * sway,
    yaw: castleBrace * castleDirection + castleLock * 0.005 * amplitude * castleDirection,
    xOffset: ux * captureDrive,
    zOffset: uz * captureDrive,
    yOffset: -compression * 0.055 + stretch * 0.025 + reboundLift * 0.055 + promotion * 0.020 + mateSeal * 0.008 - castleLockLoad * 0.030,
    scaleY: 1 - compression + stretch + reboundLift + promotion * 0.040 + mateSeal * 0.022,
    scaleXZ: 1 + compression * 0.30 - stretch * 0.12 - reboundLift * 0.10 - promotion * 0.012 - mateSeal * 0.008,
    finish: {
      braking,
      rebound,
      diagonalPawnCapture,
      castleBrace: castleBrace > 0,
      castleResponse,
      castleLock,
      castlingRole: explicitCastleKing ? 'king' : explicitCastleRook ? 'rook' : '',
      promotion: promotion > 0,
      checkmate: mateSeal > 0,
    },
  };
}

function isStaticRootChild(child) {
  return Boolean(child?.userData?.contactShadow || child?.userData?.touchHitTarget);
}

function promotionEnergyFor(group) {
  const baseScale = group?.userData?.baseScale;
  if (!baseScale?.isVector3) return 0;
  const ratios = [
    Number(group.scale?.x) / Math.max(EPSILON, Number(baseScale.x) || 1),
    Number(group.scale?.y) / Math.max(EPSILON, Number(baseScale.y) || 1),
    Number(group.scale?.z) / Math.max(EPSILON, Number(baseScale.z) || 1),
  ].filter(Number.isFinite);
  const peakRatio = ratios.length ? Math.max(...ratios) : 1;
  return clamp01((peakRatio - 1) / 0.085);
}

function collectMaterialStates(root) {
  const seen = new Set();
  const states = [];
  root?.traverse?.((object) => {
    if (!object?.isMesh || object.userData?.touchHitTarget || object.userData?.promotionMorphGhost) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || seen.has(material)) continue;
      seen.add(material);
      states.push({
        material,
        opacity: Number.isFinite(material.opacity) ? material.opacity : 1,
        transparent: Boolean(material.transparent),
        depthWrite: material.depthWrite !== false,
        colorWrite: material.colorWrite !== false,
      });
    }
  });
  return states;
}

function setMaterialOpacity(states, factor) {
  const opacityFactor = clamp01(factor);
  for (const state of states || []) {
    state.material.transparent = opacityFactor < 0.999 || state.transparent;
    state.material.depthWrite = opacityFactor >= 0.999 ? state.depthWrite : false;
    state.material.colorWrite = opacityFactor > EPSILON ? state.colorWrite : false;
    state.material.opacity = state.opacity * opacityFactor;
  }
}

function restoreMaterialStates(states) {
  for (const state of states || []) {
    state.material.opacity = state.opacity;
    state.material.transparent = state.transparent;
    state.material.depthWrite = state.depthWrite;
    state.material.colorWrite = state.colorWrite;
  }
}

function cloneMorphMaterial(material) {
  const clone = material?.clone?.() || new THREE.MeshStandardMaterial({ color: 0xb8a98f, roughness: 0.6 });
  clone.transparent = true;
  clone.depthWrite = false;
  return clone;
}

function buildPromotionPawnGhost(materialStates) {
  const main = cloneMorphMaterial(materialStates?.[0]?.material);
  const accent = cloneMorphMaterial(materialStates?.[1]?.material || materialStates?.[0]?.material);
  const ghost = new THREE.Group();
  ghost.name = 'board3d-promotion-pawn-ghost';
  ghost.userData.promotionMorphGhost = true;

  const add = (geometry, material, y = 0, rotationX = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.rotation.x = rotationX;
    mesh.castShadow = true;
    mesh.userData.promotionMorphGhost = true;
    ghost.add(mesh);
    return mesh;
  };

  add(new THREE.CylinderGeometry(0.31, 0.36, 0.20, 16), main, 0.10);
  add(new THREE.CylinderGeometry(0.15, 0.22, 0.31, 16), main, 0.39);
  add(new THREE.TorusGeometry(0.16, 0.024, 8, 24), accent, 0.57, Math.PI / 2);
  add(new THREE.SphereGeometry(0.19, 18, 12), main, 0.73);
  return ghost;
}

function setGhostOpacity(ghost, factor) {
  const opacity = clamp01(factor);
  const seen = new Set();
  ghost?.traverse?.((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || seen.has(material)) continue;
      seen.add(material);
      material.opacity = opacity;
    }
  });
}

function disposePromotionGhost(ghost) {
  const geometries = new Set();
  const materials = new Set();
  ghost?.traverse?.((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
}

export function installPieceBodyMotion(group, type, { coarsePointer = false } = {}) {
  if (!group?.isObject3D || group.userData?.board3DBodyMotionProfile) return group;

  const body = new THREE.Group();
  body.name = 'board3d-motion-body';
  body.userData.board3DBodyMotionBody = true;
  const visualBody = new THREE.Group();
  visualBody.name = 'board3d-piece-visual-body';
  visualBody.userData.board3DVisualBody = true;

  const movableChildren = [...group.children].filter((child) => !isStaticRootChild(child));
  for (const child of movableChildren) visualBody.add(child);
  if (movableChildren.length === 0) return group;
  body.add(visualBody);
  group.add(body);

  const basePosition = body.position.clone();
  const baseQuaternion = body.quaternion.clone();
  const baseScale = body.scale.clone();
  const motionEuler = new THREE.Euler(0, 0, 0, 'XYZ');
  const motionQuaternion = new THREE.Quaternion();
  const state = {
    targetSquare: '',
    maxDistance: 0,
    lastFrame: -1,
    active: false,
    finishEvent: null,
    promotionGhost: null,
    promotionMaterialStates: null,
  };

  function clearPromotionMorph() {
    let changed = false;
    if (state.promotionMaterialStates) {
      restoreMaterialStates(state.promotionMaterialStates);
      state.promotionMaterialStates = null;
      changed = true;
    }
    if (state.promotionGhost) {
      body.remove(state.promotionGhost);
      disposePromotionGhost(state.promotionGhost);
      state.promotionGhost = null;
      changed = true;
    }
    visualBody.position.set(0, 0, 0);
    visualBody.scale.set(1, 1, 1);
    group.userData.board3DPromotionMorphState = null;
    return changed;
  }

  function preparePromotionMorph() {
    const promotion = state.finishEvent?.promotion;
    if (!promotion || state.promotionGhost) return false;
    if (String(promotion.promotedType || '').toLowerCase() !== String(type || '').toLowerCase()) return false;
    if (group.userData?.color && promotion.color !== group.userData.color) return false;
    state.promotionMaterialStates = collectMaterialStates(visualBody);
    if (state.promotionMaterialStates.length === 0) return false;
    state.promotionGhost = buildPromotionPawnGhost(state.promotionMaterialStates);
    body.add(state.promotionGhost);
    setMaterialOpacity(state.promotionMaterialStates, 0);
    setGhostOpacity(state.promotionGhost, 1);
    return true;
  }

  function resetPose() {
    const morphChanged = clearPromotionMorph();
    if (!state.active && !morphChanged) return false;
    body.position.copy(basePosition);
    body.quaternion.copy(baseQuaternion);
    body.scale.copy(baseScale);
    state.active = false;
    state.finishEvent = null;
    group.userData.board3DBodyFinishState = null;
    return true;
  }

  function updatePose(renderer) {
    const frame = Number(renderer?.info?.render?.frame);
    if (Number.isFinite(frame) && state.lastFrame === frame) return;
    if (Number.isFinite(frame)) state.lastFrame = frame;

    const targetSquare = String(group.userData?.square || '');
    if (!targetSquare) {
      if (resetPose()) group.updateMatrixWorld(true);
      return;
    }

    const target = squarePosition(targetSquare);
    const dx = target.x - group.position.x;
    const dz = target.z - group.position.z;
    const remaining = Math.hypot(dx, dz);

    if (state.targetSquare !== targetSquare) {
      clearPromotionMorph();
      state.targetSquare = targetSquare;
      state.maxDistance = remaining;
      state.finishEvent = remaining > EPSILON ? consumeWarRoomMoveFinishEvent(targetSquare) : null;
      preparePromotionMorph();
    } else if (remaining > state.maxDistance) {
      // Handles a reconciled/interrupted animation without retaining stale travel.
      state.maxDistance = remaining;
      if (!state.finishEvent) {
        state.finishEvent = consumeWarRoomMoveFinishEvent(targetSquare);
        preparePromotionMorph();
      }
    }

    if (remaining <= EPSILON || state.maxDistance <= EPSILON) {
      state.maxDistance = 0;
      if (resetPose()) group.updateMatrixWorld(true);
      return;
    }

    const progress = clamp01(1 - remaining / state.maxDistance);
    const baseY = Number(group.userData?.baseY ?? 0.1);
    const airborne = clamp01((group.position.y - baseY) / 0.25);
    const promotionMorph = state.finishEvent?.promotion && state.promotionGhost
      ? derivePromotionMorph({ progress, coarsePointer })
      : null;
    const poseType = promotionMorph && progress < 0.88 ? 'p' : type;
    const pose = derivePieceBodyPose({
      type: poseType,
      progress,
      dx,
      dz,
      airborne,
      travelDistance: state.maxDistance,
      promotionEnergy: promotionEnergyFor(group),
      checkmateFinish: state.finishEvent?.checkmate === true,
      castlingRole: state.finishEvent?.castlingRole || '',
      coarsePointer,
    });

    body.position.set(
      basePosition.x + pose.xOffset,
      basePosition.y + pose.yOffset,
      basePosition.z + pose.zOffset,
    );
    motionEuler.set(pose.pitch, pose.yaw, pose.roll, 'XYZ');
    motionQuaternion.setFromEuler(motionEuler);
    body.quaternion.copy(baseQuaternion).multiply(motionQuaternion);
    body.scale.set(
      baseScale.x * pose.scaleXZ,
      baseScale.y * pose.scaleY,
      baseScale.z * pose.scaleXZ,
    );
    if (promotionMorph && state.promotionGhost && state.promotionMaterialStates) {
      setMaterialOpacity(state.promotionMaterialStates, promotionMorph.promotedOpacity);
      setGhostOpacity(state.promotionGhost, promotionMorph.pawnOpacity);
      visualBody.position.y = promotionMorph.promotedYOffset;
      visualBody.scale.setScalar(promotionMorph.promotedScale);
      state.promotionGhost.position.y = promotionMorph.pawnYOffset;
      state.promotionGhost.scale.set(
        promotionMorph.pawnScaleXZ,
        promotionMorph.pawnScaleY,
        promotionMorph.pawnScaleXZ,
      );
      group.userData.board3DPromotionMorphState = {
        from: state.finishEvent.promotion.from,
        to: state.finishEvent.promotion.to,
        promotedType: state.finishEvent.promotion.promotedType,
        pawnOpacity: promotionMorph.pawnOpacity,
        promotedOpacity: promotionMorph.promotedOpacity,
        seal: promotionMorph.seal,
      };
    }
    state.active = true;
    group.userData.board3DBodyFinishState = {
      ...pose.finish,
      promotionMorph: Boolean(promotionMorph),
    };
    group.updateMatrixWorld(true);
  }

  body.traverse((child) => {
    if (!child?.isMesh || isStaticRootChild(child)) return;
    const previous = child.onBeforeRender;
    child.onBeforeRender = function onBeforeRender(...args) {
      previous?.apply(this, args);
      updatePose(args[0]);
    };
  });

  group.userData.board3DBodyMotionProfile = coarsePointer ? 'piece-body-lite-v1' : 'piece-body-v1';
  group.userData.board3DBodyMotionType = String(type || 'p').toLowerCase();
  group.userData.board3DBodyFinishProfile = coarsePointer ? 'piece-finish-lite-v1' : 'piece-finish-v1';
  group.userData.board3DCheckmateFinishProfile = coarsePointer ? 'mate-seal-lite-v1' : 'mate-seal-v1';
  group.userData.board3DCastlingFinishProfile = coarsePointer ? 'castle-lock-lite-v1' : 'castle-lock-v1';
  group.userData.board3DPromotionMorphProfile = coarsePointer ? 'pawn-morph-lite-v1' : 'pawn-morph-v1';
  return group;
}

export { BODY_PROFILES };
