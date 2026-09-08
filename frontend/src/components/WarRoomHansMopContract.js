export const WAR_ROOM_HANS_MOP_ROUTINE_VERSION = 'hans-mop-routine-v1-room-roam';
export const HANS_MOP_START_CHANCE = 0.48;
export const HANS_MOP_DIALOGUE_CHANCE = 0.56;
export const HANS_MOP_MIN_FATIGUE_MS = 60_000;
export const HANS_MOP_MAX_FATIGUE_MS = 120_000;
export const HANS_MOP_MIN_START_DELAY_MS = 8_000;
export const HANS_MOP_MAX_START_DELAY_MS = 18_000;
export const HANS_MOP_WALK_SPEED = 0.28;
export const HANS_MOP_MIN_PATCH_MS = 6_000;
export const HANS_MOP_MAX_PATCH_MS = 10_000;
export const HANS_MOP_DIALOGUE_MATTHIAS_MS = 4_500;
export const HANS_MOP_DIALOGUE_HANS_MS = 6_000;
export const HANS_MOP_DIALOGUE_SIGH_MS = 3_000;

export const MATTHIAS_MOP_LINE = '¿En serio, Hans? ¿Ahora?';
export const HANS_MOP_REPLY_LINE = 'Sí, señor. Se pasa el día aquí, señor. Hay que fregar.';
export const MATTHIAS_MOP_SIGH_LINE = '(suspiro)';

function unit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(0.999999, n));
}

export function shouldStartHansMopRoutine(randomValue = Math.random()) {
  return unit(randomValue) < HANS_MOP_START_CHANCE;
}

export function shouldHansMopDialogue(randomValue = Math.random()) {
  return unit(randomValue) < HANS_MOP_DIALOGUE_CHANCE;
}

export function hansMopFatigueMs(randomValue = Math.random()) {
  return HANS_MOP_MIN_FATIGUE_MS
    + unit(randomValue) * (HANS_MOP_MAX_FATIGUE_MS - HANS_MOP_MIN_FATIGUE_MS);
}

export function hansMopStartDelayMs(randomValue = Math.random()) {
  return HANS_MOP_MIN_START_DELAY_MS
    + unit(randomValue) * (HANS_MOP_MAX_START_DELAY_MS - HANS_MOP_MIN_START_DELAY_MS);
}

export function hansMopPatchMs(randomValue = Math.random()) {
  return HANS_MOP_MIN_PATCH_MS
    + unit(randomValue) * (HANS_MOP_MAX_PATCH_MS - HANS_MOP_MIN_PATCH_MS);
}

export function hansMopDialoguePhase(elapsedMs) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  if (elapsed < HANS_MOP_DIALOGUE_MATTHIAS_MS) return 'matthias';
  if (elapsed < HANS_MOP_DIALOGUE_MATTHIAS_MS + HANS_MOP_DIALOGUE_HANS_MS) return 'hans';
  if (elapsed < HANS_MOP_DIALOGUE_MATTHIAS_MS + HANS_MOP_DIALOGUE_HANS_MS + HANS_MOP_DIALOGUE_SIGH_MS) return 'sigh';
  return '';
}