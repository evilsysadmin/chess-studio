export const WAR_ROOM_HANS_SERVICE_CONTRACT_VERSION = 'hans-service-contract-v1';

export const HANS_ESPRESSO_LINE = 'Su espresso, señor.';
export const MATTHIAS_ESPRESSO_LINE = 'Danke, Hans. Déjamelo por ahí.';

export const HANS_WATER_PLANT_ACTION_MS = 6500;
export const HANS_ESPRESSO_ACTION_MS = 9200;
export const HANS_ESPRESSO_REPLY_SWITCH_MS = 4200;
export const HANS_ESPRESSO_DIALOGUE_END_MS = 8800;

export function warRoomHansServiceDialoguePhase(eventName, elapsedMs) {
  if (eventName !== 'espresso') return '';
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  if (elapsed < HANS_ESPRESSO_REPLY_SWITCH_MS) return 'hans-espresso';
  if (elapsed < HANS_ESPRESSO_DIALOGUE_END_MS) return 'matthias-espresso';
  return '';
}

export function warRoomHansServiceActionMs(eventName) {
  if (eventName === 'water-plant') return HANS_WATER_PLANT_ACTION_MS;
  if (eventName === 'espresso') return HANS_ESPRESSO_ACTION_MS;
  return 0;
}
