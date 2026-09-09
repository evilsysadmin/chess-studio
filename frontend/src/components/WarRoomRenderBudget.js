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

export function adaptiveRenderScale({ coarsePointer = false, slowFrameCount = 0 } = {}) {
  // Animation is the hottest path: moving geometry, transparency and reactive
  // lighting all converge here. Keep the static War Room crisp, but drop the
  // animation budget one notch before frame loss becomes visible.
  if (coarsePointer) return slowFrameCount >= 4 ? 0.75 : 1;
  return slowFrameCount >= 4 ? 0.9 : 1.2;
}
