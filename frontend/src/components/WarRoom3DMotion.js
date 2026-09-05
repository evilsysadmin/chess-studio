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
    state.lastRenderAt = now;
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

    // The scene still renders every requested frame, but the expensive directional
    // shadow pass no longer follows it blindly at 60 Hz. Piece contact shadows keep
    // movement grounded between refreshes; the final move frame is always far enough
    // past the interval to refresh the real shadow map again.
    this.shadowMap.autoUpdate = false;
    if (shouldRefreshShadowMap({ now, lastShadowAt: state.lastShadowAt, coarsePointer })) {
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
  // v9 art direction: the previous 1.72 key reduction was being visually masked by
  // the room's independent practical lights (torches, sconces, desk lamps and museum
  // keys). Keep those practicals and the global exposure intact, but move the actual
  // desktop board key far enough down that the ivory side changes perceptibly.
  const baseExposure = coarsePointer ? 1.005 : 1.04;
  if (gameOver) {
    return {
      key: coarsePointer ? 1.52 : 1.34,
      rim: coarsePointer ? 7.1 : 6.8,
      warm: coarsePointer ? 3.0 : 2.75,
      exposure: baseExposure - 0.075,
      fogDensity: coarsePointer ? 0.0215 : 0.0225,
    };
  }
  if (check) {
    return {
      key: coarsePointer ? 2.32 : 1.84,
      rim: coarsePointer ? 16.8 : 16.4,
      warm: coarsePointer ? 4.9 : 4.55,
      exposure: baseExposure + 0.005,
      fogDensity: coarsePointer ? 0.019 : 0.0192,
    };
  }
  return {
    key: coarsePointer ? 1.99 : 1.52,
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
