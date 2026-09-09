import { WAR_ROOM_HANS_CHORE_EVENTS } from './WarRoomHansChoreContract.js';

const CHORE_EVENTS = new Set(WAR_ROOM_HANS_CHORE_EVENTS);

export function warRoomHansPresentationPolicy({
  eventName = '',
  fireplaceEligible = false,
  reducedMotion = false,
} = {}) {
  const event = String(eventName || '');
  return {
    fireplaceIteration: Boolean(fireplaceEligible && event === 'fire' && !reducedMotion),
    mopDialogue: event === 'mop',
    serviceDialogue: event === 'espresso' || CHORE_EVENTS.has(event),
  };
}
