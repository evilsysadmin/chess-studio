// Pure validator for the optional physical-GPU deep-idle benchmark.
// This counts completed renderer.render() calls, never requestAnimationFrame ticks.
export const WAR_ROOM_DEEP_IDLE_WAIT_MS = 34_000;
export const WAR_ROOM_DEEP_IDLE_TAIL_MS = 2_500;

export function assessWarRoomDeepIdleCapture({
  capture,
  startedAtMs,
  endedAtMs,
  visibility,
  visibilityBefore,
  visibilityTransitions,
  tailMs = WAR_ROOM_DEEP_IDLE_TAIL_MS,
} = {}) {
  const elapsedMs = Number(endedAtMs) - Number(startedAtMs);
  // A tab that went hidden and returned is not a valid foreground idle
  // sample. It can report zero paints simply because browser throttling
  // suspended the page instead of our own scheduler doing so.
  if (visibility !== 'visible' || visibilityBefore !== 'visible') {
    return { status: 'not-foreground' };
  }
  if (!Number.isSafeInteger(visibilityTransitions) || visibilityTransitions < 0) {
    return { status: 'missing-visibility-history' };
  }
  if (visibilityTransitions > 0) return { status: 'visibility-interrupted', visibilityTransitions };
  if (!Number.isFinite(elapsedMs) || elapsedMs < WAR_ROOM_DEEP_IDLE_WAIT_MS) {
    return { status: 'insufficient-duration', elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : null };
  }
  if (!capture || !Array.isArray(capture.samples)) return { status: 'missing-journal' };
  if (capture.overflow) return { status: 'journal-overflow' };
  const cutoff = Number(endedAtMs) - tailMs;
  if (cutoff < Number(startedAtMs) + 30_000) return { status: 'invalid-tail' };
  const entries = capture.samples;
  if (entries.some((frame) =>
    !Number.isFinite(frame?.startedAtMs) || !Number.isFinite(frame?.endedAtMs)
      || frame.endedAtMs < frame.startedAtMs || !Number.isSafeInteger(frame.calls)
      || frame.calls < 0)) return { status: 'invalid-render-sample' };
  // Count a draw that overlaps the tail boundary. A slow frame starting
  // slightly earlier must never be mistaken for zero WebGL activity.
  const tail = entries.filter((frame) =>
    frame.endedAtMs >= cutoff && frame.startedAtMs <= endedAtMs);
  return {
    status: 'ready',
    elapsedMs: Math.round(elapsedMs),
    tailMs,
    totalRenderSubmissions: entries.length,
    tailRenderSubmissions: tail.length,
    tailDrawCalls: tail.reduce((sum, frame) => sum + frame.calls, 0),
    // No draw submissions in the final phase means the deep-sleep contract
    // actually held; this is NOT evidence of low system CPU/GPU utilization.
    deepSleepObserved: tail.length === 0,
  };
}
