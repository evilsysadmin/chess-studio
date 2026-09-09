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
  const desktop = {
    p: { duration: 118, lift: 0.11, impactStart: 0.46, captureTilt: 0.74, captureExtra: 32 },
    n: { duration: 154, lift: 0.31, impactStart: 0.40, captureTilt: 0.92, captureExtra: 28 },
    b: { duration: 128, lift: 0.10, impactStart: 0.47, captureTilt: 0.70, captureExtra: 30 },
    r: { duration: 146, lift: 0.055, impactStart: 0.53, captureTilt: 0.62, captureExtra: 34 },
    q: { duration: 112, lift: 0.075, impactStart: 0.44, captureTilt: 0.76, captureExtra: 35 },
    k: { duration: 164, lift: 0.065, impactStart: 0.50, captureTilt: 0.58, captureExtra: 30 },
  };
  const coarse = {
    p: { duration: 110, lift: 0.06, impactStart: 0.47, captureTilt: 0.68, captureExtra: 24 },
    n: { duration: 142, lift: 0.18, impactStart: 0.42, captureTilt: 0.84, captureExtra: 24 },
    b: { duration: 118, lift: 0.065, impactStart: 0.49, captureTilt: 0.64, captureExtra: 24 },
    r: { duration: 132, lift: 0.045, impactStart: 0.54, captureTilt: 0.56, captureExtra: 28 },
    q: { duration: 106, lift: 0.055, impactStart: 0.46, captureTilt: 0.70, captureExtra: 28 },
    k: { duration: 148, lift: 0.05, impactStart: 0.51, captureTilt: 0.54, captureExtra: 26 },
  };
  const profileSet = coarsePointer ? coarse : desktop;
  const profile = profileSet[type] || profileSet.p;
  return {
    duration: profile.duration + (capture ? profile.captureExtra : 0),
    lift: capture ? Math.max(profile.lift, coarsePointer ? 0.075 : 0.16) : profile.lift,
    impactStart: capture ? profile.impactStart : 1,
    captureTilt: capture ? profile.captureTilt : 0,
    promotionPulse: promotion ? 0.085 : 0,
    rookDelay: castling ? 0.16 : 0,
  };
}
