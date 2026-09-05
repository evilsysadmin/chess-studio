export const CINEMATIC_AUTOPSY_VERSION = 1;

function finiteIndex(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function buildCinematicAutopsyPlan(moments = []) {
  const source = Array.isArray(moments) ? moments : [];
  const seen = new Set();
  const plan = [];

  for (const item of source) {
    const move = item?.move || null;
    const moveIndex = finiteIndex(move?.index);
    if (moveIndex === null || seen.has(moveIndex)) continue;
    seen.add(moveIndex);
    plan.push({
      version: CINEMATIC_AUTOPSY_VERSION,
      id: `${item?.kind || 'moment'}-${moveIndex}`,
      kind: item?.kind || 'moment',
      label: item?.label || 'Momento clave',
      icon: item?.icon || '◆',
      detail: item?.detail || '',
      moveIndex,
      focusStep: moveIndex,
      impactStep: moveIndex + 1,
      moveNumber: Number(move?.moveNumber) || Math.floor(moveIndex / 2) + 1,
      played: move?.played || '',
      suggested: move?.suggested || '',
      loss: Math.max(0, Number(move?.loss) || 0),
      severity: move?.severity || 'ok',
    });
    if (plan.length === 3) break;
  }

  return plan;
}

export function clampCinematicAutopsyCursor(plan = [], cursor = 0) {
  const length = Array.isArray(plan) ? plan.length : 0;
  if (!length) return 0;
  return Math.max(0, Math.min(length - 1, Math.floor(Number(cursor) || 0)));
}
