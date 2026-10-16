// Coarse, session-local wall-clock phases for the Blender War Room path.
// No network telemetry, no global listeners, no per-frame DOM mutation.
export const WAR_ROOM_SHELL_TIMING_PHASES = Object.freeze([
  'import', 'glb', 'materials', 'effects', 'readyPaint',
]);

export function createWarRoomShellTiming({
  canvas,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
} = {}) {
  const valid = new Set(WAR_ROOM_SHELL_TIMING_PHASES);
  const startedAt = now();
  let previousAt = startedAt;
  let disposed = false;

  // A variant switch reuses the canvas. Never attribute old phases to the
  // next room, especially if this room fails before its GLB becomes ready.
  if (canvas?.dataset) {
    for (const phase of WAR_ROOM_SHELL_TIMING_PHASES) {
      delete canvas.dataset[`warRoomShellTiming${phase[0].toUpperCase()}${phase.slice(1)}Ms`];
    }
  }

  const mark = (phase) => {
    if (disposed || !valid.has(phase)) return null;
    const at = now();
    const durationMs = Math.max(0, at - previousAt);
    previousAt = at;
    const roundedMs = Math.round(durationMs);
    if (canvas?.dataset) {
      const key = `warRoomShellTiming${phase[0].toUpperCase()}${phase.slice(1)}Ms`;
      canvas.dataset[key] = String(roundedMs);
    }
    return roundedMs;
  };

  return { mark, dispose: () => { disposed = true; } };
}
