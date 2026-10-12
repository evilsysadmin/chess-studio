// First-person Chronicles is an MM3 tribute: no per-action checkpoint writes.
// Only a deliberate Save or a transition between distinct areas may persist a run.
export function chroniclesCheckpointReason(previousMapId, nextMapId, manual = false) {
  if (manual) return 'manual';
  if (typeof previousMapId === 'string' && previousMapId
    && typeof nextMapId === 'string' && nextMapId
    && previousMapId !== nextMapId) return 'area-change';
  return null;
}
