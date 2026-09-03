export const MATTHIAS_HOME_PRESENCE_VERSION = 'home-presence-v1';

export const MATTHIAS_HOME_STATES = Object.freeze({
  IDLE: 'idle',
  GLANCE_LEFT: 'glance-left',
  GLANCE_RIGHT: 'glance-right',
  SURVEY: 'survey',
  LEAN_IN: 'lean-in',
  NOD: 'nod',
  SKEPTICAL: 'skeptical',
  ATTEND: 'attend',
});

const AMBIENT_STATES = Object.freeze([
  MATTHIAS_HOME_STATES.GLANCE_LEFT,
  MATTHIAS_HOME_STATES.GLANCE_RIGHT,
  MATTHIAS_HOME_STATES.SURVEY,
  MATTHIAS_HOME_STATES.LEAN_IN,
  MATTHIAS_HOME_STATES.NOD,
  MATTHIAS_HOME_STATES.SKEPTICAL,
]);

const DESCRIPTORS = Object.freeze({
  [MATTHIAS_HOME_STATES.IDLE]: { gesture: 'idle', label: 'Vigilando' },
  [MATTHIAS_HOME_STATES.GLANCE_LEFT]: { gesture: 'glance-left', label: 'Mirada lateral' },
  [MATTHIAS_HOME_STATES.GLANCE_RIGHT]: { gesture: 'glance-right', label: 'Mirada lateral' },
  [MATTHIAS_HOME_STATES.SURVEY]: { gesture: 'survey', label: 'Inspeccionando' },
  [MATTHIAS_HOME_STATES.LEAN_IN]: { gesture: 'lean-in', label: 'Prestando atención' },
  [MATTHIAS_HOME_STATES.NOD]: { gesture: 'nod', label: 'Asintiendo' },
  [MATTHIAS_HOME_STATES.SKEPTICAL]: { gesture: 'skeptical', label: 'Juzgando en silencio' },
  [MATTHIAS_HOME_STATES.ATTEND]: { gesture: 'attend', label: 'Hablando' },
});

function clamp01(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function weightedPick(weighted, random = Math.random) {
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return MATTHIAS_HOME_STATES.GLANCE_LEFT;
  let cursor = clamp01(random()) * total;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.mode;
  }
  return weighted.at(-1)?.mode || MATTHIAS_HOME_STATES.GLANCE_LEFT;
}

export function createMatthiasHomePresenceMachine() {
  return {
    mode: MATTHIAS_HOME_STATES.IDLE,
    speaking: false,
    lastAmbient: null,
  };
}

export function normalizeMatthiasHomeState(value) {
  const mode = String(value || '').trim().toLowerCase();
  return Object.values(MATTHIAS_HOME_STATES).includes(mode)
    ? mode
    : MATTHIAS_HOME_STATES.IDLE;
}

export function matthiasHomeStateDescriptor(mode) {
  return DESCRIPTORS[normalizeMatthiasHomeState(mode)] || DESCRIPTORS[MATTHIAS_HOME_STATES.IDLE];
}

export function matthiasHomeIdleDelay(random = Math.random, profile = 'idle') {
  const value = clamp01(random());
  if (profile === 'sleep') return Math.round(6200 + value * 6200);
  if (profile === 'read' || profile === 'dossier') return Math.round(4800 + value * 5600);
  if (profile === 'sip' || profile === 'bite') return Math.round(5200 + value * 5200);
  return Math.round(4000 + value * 5000);
}

export function matthiasHomeStateDuration(mode) {
  switch (normalizeMatthiasHomeState(mode)) {
    case MATTHIAS_HOME_STATES.GLANCE_LEFT:
    case MATTHIAS_HOME_STATES.GLANCE_RIGHT:
      return 880;
    case MATTHIAS_HOME_STATES.SURVEY:
      return 1380;
    case MATTHIAS_HOME_STATES.LEAN_IN:
      return 1120;
    case MATTHIAS_HOME_STATES.NOD:
      return 920;
    case MATTHIAS_HOME_STATES.SKEPTICAL:
      return 1260;
    case MATTHIAS_HOME_STATES.ATTEND:
      return 0;
    default:
      return 0;
  }
}

export function nextMatthiasHomeAmbientState({
  random = Math.random,
  lastAmbient = null,
  profile = 'idle',
} = {}) {
  const weights = new Map([
    [MATTHIAS_HOME_STATES.GLANCE_LEFT, 18],
    [MATTHIAS_HOME_STATES.GLANCE_RIGHT, 18],
    [MATTHIAS_HOME_STATES.SURVEY, 17],
    [MATTHIAS_HOME_STATES.LEAN_IN, 13],
    [MATTHIAS_HOME_STATES.NOD, 17],
    [MATTHIAS_HOME_STATES.SKEPTICAL, 17],
  ]);

  if (profile === 'read' || profile === 'dossier' || profile === 'write') {
    weights.set(MATTHIAS_HOME_STATES.SURVEY, 26);
    weights.set(MATTHIAS_HOME_STATES.NOD, 22);
    weights.set(MATTHIAS_HOME_STATES.LEAN_IN, 9);
  } else if (profile === 'sleep') {
    weights.set(MATTHIAS_HOME_STATES.NOD, 42);
    weights.set(MATTHIAS_HOME_STATES.SURVEY, 5);
    weights.set(MATTHIAS_HOME_STATES.SKEPTICAL, 5);
  } else if (profile === 'sip' || profile === 'bite') {
    weights.set(MATTHIAS_HOME_STATES.GLANCE_LEFT, 23);
    weights.set(MATTHIAS_HOME_STATES.GLANCE_RIGHT, 23);
    weights.set(MATTHIAS_HOME_STATES.LEAN_IN, 9);
  } else if (profile === 'think') {
    weights.set(MATTHIAS_HOME_STATES.SKEPTICAL, 27);
    weights.set(MATTHIAS_HOME_STATES.LEAN_IN, 22);
  }

  let candidates = AMBIENT_STATES
    .map((mode) => ({ mode, weight: weights.get(mode) || 1 }))
    .filter((entry) => entry.mode !== lastAmbient);
  if (!candidates.length) candidates = AMBIENT_STATES.map((mode) => ({ mode, weight: 1 }));
  return weightedPick(candidates, random);
}

export function transitionMatthiasHomePresence(state, event = {}) {
  const current = state || createMatthiasHomePresenceMachine();
  switch (event.type) {
    case 'RESET':
      return createMatthiasHomePresenceMachine();
    case 'SPEECH_START':
      return {
        ...current,
        mode: MATTHIAS_HOME_STATES.ATTEND,
        speaking: true,
      };
    case 'SPEECH_END':
      return {
        ...current,
        mode: MATTHIAS_HOME_STATES.IDLE,
        speaking: false,
      };
    case 'AMBIENT_START': {
      if (current.speaking) return current;
      const mode = normalizeMatthiasHomeState(event.mode);
      if (!AMBIENT_STATES.includes(mode)) return current;
      return {
        ...current,
        mode,
        lastAmbient: mode,
      };
    }
    case 'AMBIENT_END':
      if (current.speaking) return current;
      if (event.mode && normalizeMatthiasHomeState(event.mode) !== current.mode) return current;
      return {
        ...current,
        mode: MATTHIAS_HOME_STATES.IDLE,
      };
    default:
      return current;
  }
}
