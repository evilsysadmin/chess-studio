import * as THREE from 'three';

const WAR_ROOM_RENDER_DISCIPLINE = Symbol.for('chess-studio.war-room-render-discipline');
const shadowRefreshState = new WeakMap();

export function shadowRefreshInterval({ coarsePointer = false } = {}) {
  return coarsePointer ? 180 : 120;
}

export function shouldRefreshShadowMap({ now = 0, lastShadowAt = Number.NEGATIVE_INFINITY, coarsePointer = false } = {}) {
  const current = Number(now);
  const previous = Number(lastShadowAt);
  if (!Number.isFinite(previous)) return true;
  if (!Number.isFinite(current)) return false;
  return current - previous >= shadowRefreshInterval({ coarsePointer });
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
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    const state = shadowRefreshState.get(this) || { lastShadowAt: Number.NEGATIVE_INFINITY };

    // The scene still renders every requested frame, but the expensive directional
    // shadow pass no longer follows it blindly at 60 Hz. Piece contact shadows keep
    // movement grounded between refreshes; the final move frame is always far enough
    // past the interval to refresh the real shadow map again.
    this.shadowMap.autoUpdate = false;
    if (shouldRefreshShadowMap({ now, lastShadowAt: state.lastShadowAt, coarsePointer })) {
      this.shadowMap.needsUpdate = true;
      state.lastShadowAt = now;
      shadowRefreshState.set(this, state);
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
  const baseExposure = coarsePointer ? 1.02 : 1.05;
  if (gameOver) return { key: 1.65, rim: 8.4, warm: 3.1, exposure: baseExposure - 0.08, fogDensity: 0.022 };
  if (check) return { key: 2.7, rim: 18.5, warm: 5.2, exposure: baseExposure + 0.01, fogDensity: 0.0195 };
  return { key: 2.35, rim: 14.5, warm: 5.8, exposure: baseExposure, fogDensity: 0.018 };
}

export function adaptiveRenderScale({ coarsePointer = false, slowFrameCount = 0 } = {}) {
  // Animation is the hottest path: moving geometry, transparency and reactive
  // lighting all converge here. Keep the static War Room crisp, but drop the
  // animation budget one notch before frame loss becomes visible.
  if (coarsePointer) return slowFrameCount >= 4 ? 0.75 : 1;
  return slowFrameCount >= 4 ? 0.9 : 1.2;
}
