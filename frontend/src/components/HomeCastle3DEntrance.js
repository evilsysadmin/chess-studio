const HOME_CASTLE_ENTRANCE_DURATION_MS = 820;

function easeOutCubic(value) {
  const clamped = Math.max(0, Math.min(1, Number(value) || 0));
  return 1 - Math.pow(1 - clamped, 3);
}

export function homeCastleEntranceFrame(elapsedMs, reducedMotion = false) {
  if (reducedMotion) return { progress: 1, cameraY: 0, zoom: 1 };
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const progress = easeOutCubic(elapsed / HOME_CASTLE_ENTRANCE_DURATION_MS);
  const remaining = 1 - progress;
  return {
    progress,
    cameraY: 0.012 * remaining,
    zoom: 0.994 + (0.006 * progress),
  };
}
