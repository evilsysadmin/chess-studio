// Pure motion/lighting helpers live here so the 3D scene can be tuned and tested
// without coupling chess rules or game-state ownership to the renderer.
//
// Important: this module must stay free of document-level pointer listeners.
// A capture-phase pointermove guard briefly used to freeze the War Room camera
// also swallowed the desktop interaction stream before it reached the WebGL
// canvas. Camera policy belongs inside Board3D; motion math must not interfere
// with chess input.

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
  const duration = coarsePointer ? (capture ? 250 : 210) : (capture ? 330 : type === 'n' ? 300 : 255);
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
  if (coarsePointer) return slowFrameCount >= 8 ? 1 : 1.25;
  return slowFrameCount >= 10 ? 1.35 : 1.75;
}
