export const MATTHIAS_WAR_ROOM_STATES = Object.freeze({
  IDLE: 'idle',
  GLANCE: 'glance',
  GLARE: 'glare',
  HEAD_LEFT: 'head-left',
  HEAD_RIGHT: 'head-right',
  LEAN_IN: 'lean-in',
  SURVEY: 'survey',
  COFFEE: 'coffee',
  SPEAKING: 'speaking',
  SMIRK: 'smirk',
  GRUMBLE: 'grumble',
});

const AMBIENT_STATES = new Set([
  MATTHIAS_WAR_ROOM_STATES.GLANCE,
  MATTHIAS_WAR_ROOM_STATES.GLARE,
  MATTHIAS_WAR_ROOM_STATES.HEAD_LEFT,
  MATTHIAS_WAR_ROOM_STATES.HEAD_RIGHT,
  MATTHIAS_WAR_ROOM_STATES.LEAN_IN,
  MATTHIAS_WAR_ROOM_STATES.SURVEY,
  MATTHIAS_WAR_ROOM_STATES.COFFEE,
]);

const REACTION_STATES = new Set([
  MATTHIAS_WAR_ROOM_STATES.SMIRK,
  MATTHIAS_WAR_ROOM_STATES.GRUMBLE,
]);

const AMBIENT_FALLBACK = Object.freeze({
  [MATTHIAS_WAR_ROOM_STATES.GLANCE]: MATTHIAS_WAR_ROOM_STATES.HEAD_LEFT,
  [MATTHIAS_WAR_ROOM_STATES.GLARE]: MATTHIAS_WAR_ROOM_STATES.GLANCE,
  [MATTHIAS_WAR_ROOM_STATES.HEAD_LEFT]: MATTHIAS_WAR_ROOM_STATES.HEAD_RIGHT,
  [MATTHIAS_WAR_ROOM_STATES.HEAD_RIGHT]: MATTHIAS_WAR_ROOM_STATES.HEAD_LEFT,
  [MATTHIAS_WAR_ROOM_STATES.LEAN_IN]: MATTHIAS_WAR_ROOM_STATES.GLANCE,
  [MATTHIAS_WAR_ROOM_STATES.SURVEY]: MATTHIAS_WAR_ROOM_STATES.GLANCE,
  [MATTHIAS_WAR_ROOM_STATES.COFFEE]: MATTHIAS_WAR_ROOM_STATES.GLANCE,
});

export const MATTHIAS_WAR_ROOM_STATE_VERSION = 'fsm-v2';

export function normalizeWarRoomAnger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(4, Math.round(parsed)));
}

export function normalizeWarRoomReaction(value) {
  if (value === 'disapprove') return MATTHIAS_WAR_ROOM_STATES.GRUMBLE;
  if (value === 'smirk') return MATTHIAS_WAR_ROOM_STATES.SMIRK;
  return null;
}

export function createMatthiasWarRoomMachine() {
  return {
    mode: MATTHIAS_WAR_ROOM_STATES.IDLE,
    speaking: false,
    lastAmbient: null,
    revision: 0,
  };
}

function withMode(state, mode, extra = {}) {
  return {
    ...state,
    ...extra,
    mode,
    revision: Number(state?.revision || 0) + 1,
  };
}

export function transitionMatthiasWarRoom(state = createMatthiasWarRoomMachine(), event = {}) {
  const current = state || createMatthiasWarRoomMachine();
  const type = String(event?.type || '');

  if (type === 'RESET') return createMatthiasWarRoomMachine();

  if (type === 'SPEECH_START') {
    if (REACTION_STATES.has(current.mode)) {
      return { ...current, speaking: true, revision: current.revision + 1 };
    }
    return withMode(current, MATTHIAS_WAR_ROOM_STATES.SPEAKING, { speaking: true });
  }

  if (type === 'SPEECH_END') {
    if (!current.speaking && current.mode !== MATTHIAS_WAR_ROOM_STATES.SPEAKING) return current;
    if (current.mode === MATTHIAS_WAR_ROOM_STATES.SPEAKING) {
      return withMode(current, MATTHIAS_WAR_ROOM_STATES.IDLE, { speaking: false });
    }
    return { ...current, speaking: false, revision: current.revision + 1 };
  }

  if (type === 'REACTION_START') {
    const mode = normalizeWarRoomReaction(event.reaction);
    if (!mode) return current;
    return withMode(current, mode);
  }

  if (type === 'REACTION_END') {
    const expected = normalizeWarRoomReaction(event.reaction);
    if (!expected || current.mode !== expected) return current;
    return withMode(
      current,
      current.speaking ? MATTHIAS_WAR_ROOM_STATES.SPEAKING : MATTHIAS_WAR_ROOM_STATES.IDLE,
    );
  }

  if (type === 'AMBIENT_START') {
    const mode = event.mode;
    if (!AMBIENT_STATES.has(mode)) return current;
    if (current.mode !== MATTHIAS_WAR_ROOM_STATES.IDLE || current.speaking) return current;
    return withMode(current, mode, { lastAmbient: mode });
  }

  if (type === 'AMBIENT_END') {
    if (!AMBIENT_STATES.has(current.mode)) return current;
    if (event.mode && current.mode !== event.mode) return current;
    return withMode(current, MATTHIAS_WAR_ROOM_STATES.IDLE);
  }

  return current;
}

function pickRawAmbientState(roll, angerLevel) {
  const anger = normalizeWarRoomAnger(angerLevel);
  const coffeeCutoff = anger >= 4 ? 0.012 : anger >= 2 ? 0.022 : 0.035;
  const glanceCutoff = coffeeCutoff + (anger >= 3 ? 0.24 : 0.30);
  const leftCutoff = glanceCutoff + 0.10;
  const rightCutoff = leftCutoff + 0.10;
  const surveyCutoff = rightCutoff + 0.16;
  const leanCutoff = surveyCutoff + (anger >= 3 ? 0.18 : 0.14);

  if (roll < coffeeCutoff) return MATTHIAS_WAR_ROOM_STATES.COFFEE;
  if (roll < glanceCutoff) return MATTHIAS_WAR_ROOM_STATES.GLANCE;
  if (roll < leftCutoff) return MATTHIAS_WAR_ROOM_STATES.HEAD_LEFT;
  if (roll < rightCutoff) return MATTHIAS_WAR_ROOM_STATES.HEAD_RIGHT;
  if (roll < surveyCutoff) return MATTHIAS_WAR_ROOM_STATES.SURVEY;
  if (roll < leanCutoff) return MATTHIAS_WAR_ROOM_STATES.LEAN_IN;
  return MATTHIAS_WAR_ROOM_STATES.GLARE;
}

export function nextMatthiasAmbientState({ random = Math.random, angerLevel = 0, lastAmbient = null } = {}) {
  const roll = Math.max(0, Math.min(0.999999, Number(random?.()) || 0));
  const next = pickRawAmbientState(roll, angerLevel);
  if (next !== lastAmbient) return next;
  return AMBIENT_FALLBACK[next] || MATTHIAS_WAR_ROOM_STATES.GLANCE;
}

export function matthiasWarRoomStateDuration(mode, angerLevel = 0) {
  const anger = normalizeWarRoomAnger(angerLevel);
  if (mode === MATTHIAS_WAR_ROOM_STATES.COFFEE) return 3600;
  if (mode === MATTHIAS_WAR_ROOM_STATES.SURVEY) return 2300;
  if (mode === MATTHIAS_WAR_ROOM_STATES.LEAN_IN) return 1750;
  if (mode === MATTHIAS_WAR_ROOM_STATES.GLARE) return anger >= 3 ? 1650 : 1450;
  if (mode === MATTHIAS_WAR_ROOM_STATES.HEAD_LEFT || mode === MATTHIAS_WAR_ROOM_STATES.HEAD_RIGHT) return 1150;
  if (mode === MATTHIAS_WAR_ROOM_STATES.SMIRK) return 1120;
  if (mode === MATTHIAS_WAR_ROOM_STATES.GRUMBLE) return anger >= 3 ? 1120 : 920;
  if (mode === MATTHIAS_WAR_ROOM_STATES.GLANCE) return 900;
  return 0;
}

export function matthiasWarRoomIdleDelay(random = Math.random, angerLevel = 0) {
  const anger = normalizeWarRoomAnger(angerLevel);
  const min = anger >= 3 ? 2600 : anger >= 1 ? 3400 : 4200;
  const spread = anger >= 3 ? 3600 : anger >= 1 ? 4400 : 5200;
  const roll = Math.max(0, Math.min(0.999999, Number(random?.()) || 0));
  return min + Math.round(roll * spread);
}

export function matthiasWarRoomStateDescriptor(mode, angerLevel = 0) {
  const anger = normalizeWarRoomAnger(angerLevel);
  const descriptors = {
    [MATTHIAS_WAR_ROOM_STATES.IDLE]: {
      expression: anger >= 3 ? 'simmer' : 'stern',
      activity: anger >= 3 ? 'Conteniendo la rabia' : 'Vigilando el tablero',
      gesture: 'idle',
      facialGesture: 'war-idle',
    },
    [MATTHIAS_WAR_ROOM_STATES.GLANCE]: { expression: 'alert', activity: 'Vigilando el tablero', gesture: 'glance', facialGesture: 'war-glance' },
    [MATTHIAS_WAR_ROOM_STATES.GLARE]: { expression: 'glare', activity: 'Vigilancia hostil', gesture: 'glare', facialGesture: 'war-glare' },
    [MATTHIAS_WAR_ROOM_STATES.HEAD_LEFT]: { expression: 'stern', activity: 'Inspeccionando el flanco', gesture: 'head-left', facialGesture: 'war-head-left' },
    [MATTHIAS_WAR_ROOM_STATES.HEAD_RIGHT]: { expression: 'stern', activity: 'Inspeccionando el flanco', gesture: 'head-right', facialGesture: 'war-head-right' },
    [MATTHIAS_WAR_ROOM_STATES.LEAN_IN]: { expression: 'focus', activity: 'Calculando', gesture: 'lean-in', facialGesture: 'war-lean-in' },
    [MATTHIAS_WAR_ROOM_STATES.SURVEY]: { expression: 'alert', activity: 'Barriendo la sala', gesture: 'survey', facialGesture: 'war-survey' },
    [MATTHIAS_WAR_ROOM_STATES.COFFEE]: { expression: 'coffee', activity: 'Café de campaña', gesture: 'coffee', facialGesture: 'war-coffee' },
    [MATTHIAS_WAR_ROOM_STATES.SPEAKING]: { expression: anger >= 3 ? 'simmer' : 'stern', activity: 'Dictando sentencia', gesture: 'idle', facialGesture: 'war-speaking' },
    [MATTHIAS_WAR_ROOM_STATES.SMIRK]: { expression: 'smirk', activity: 'Ventaja táctica', gesture: 'idle', facialGesture: 'war-smirk' },
    [MATTHIAS_WAR_ROOM_STATES.GRUMBLE]: { expression: anger >= 3 ? 'grumble-hot' : 'grumble', activity: 'Desaprobación táctica', gesture: 'idle', facialGesture: 'war-grumble' },
  };
  return descriptors[mode] || descriptors[MATTHIAS_WAR_ROOM_STATES.IDLE];
}
