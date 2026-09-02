export function warRoomAmbientFramePlan({
  documentHidden = false,
  reducedMotion = false,
  coarsePointer = false,
  inspectMode = false,
  elapsedMs = 0,
} = {}) {
  const active = !documentHidden && !reducedMotion && !coarsePointer;
  // The idle heartbeat exists to keep fire/light alive, not to turn the whole
  // castle into a 60 FPS game loop. ~12 FPS looks natural for irregular flame
  // flicker while leaving generous main-thread/GPU headroom for board input.
  // Inspect mode remains responsive at ~60 FPS because camera motion needs it.
  const intervalMs = inspectMode ? 16 : 83;
  const due = active && Number(elapsedMs) >= intervalMs;

  return Object.freeze({
    active,
    intervalMs,
    shouldRender: due,
    updateCamera: due && inspectMode,
  });
}
