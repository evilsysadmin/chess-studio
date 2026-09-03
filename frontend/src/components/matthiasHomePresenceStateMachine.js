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
  // Home gestures need enough air to feel ambient, but a 4–9 second default
  // silence made a technically animated Matthias look completely embalmed.
  if (profile === 'sleep') return Math.round(4600 + value * 3600);
  if (profile === 'read' || profile === 'dossier') return Math.round(2200 + value * 2800);
  if (profile === 'sip' || profile === 'bite') return Math.round(2400 + value * 2600);
  return Math.round(1800 + value * 2600);
}

export function matthiasHomeStateDuration(mode) {
  switch (normalizeMatthiasHomeState(mode)) {
    case MATTHIAS_HOME_STATES.GLANCE_LEFT:
    case MATTHIAS_HOME_STATES.GLANCE_RIGHT:
      return 1250;
    case MATTHIAS_HOME_STATES.SURVEY:
      return 1900;
    case MATTHIAS_HOME_STATES.LEAN_IN:
      return 1750;
    case MATTHIAS_HOME_STATES.NOD:
      return 1450;
    case MATTHIAS_HOME_STATES.SKEPTICAL:
      return 1850;
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
  // Glances are intentionally lighter-weight than gestures that visibly alter
  // posture/expression. The old near-even mix often selected sub-degree glances
  // that were measurable in browser gates but practically invisible to humans.
  const weights = new Map([
    [MATTHIAS_HOME_STATES.GLANCE_LEFT, 10],
    [MATTHIAS_HOME_STATES.GLANCE_RIGHT, 10],
    [MATTHIAS_HOME_STATES.SURVEY, 22],
    [MATTHIAS_HOME_STATES.LEAN_IN, 20],
    [MATTHIAS_HOME_STATES.NOD, 19],
    [MATTHIAS_HOME_STATES.SKEPTICAL, 19],
  ]);

  if (profile === 'read' || profile === 'dossier' || profile === 'write') {
    weights.set(MATTHIAS_HOME_STATES.SURVEY, 32);
    weights.set(MATTHIAS_HOME_STATES.NOD, 25);
    weights.set(MATTHIAS_HOME_STATES.LEAN_IN, 15);
    weights.set(MATTHIAS_HOME_STATES.GLANCE_LEFT, 7);
    weights.set(MATTHIAS_HOME_STATES.GLANCE_RIGHT, 7);
  } else if (profile === 'sleep') {
    weights.set(MATTHIAS_HOME_STATES.NOD, 50);
    weights.set(MATTHIAS_HOME_STATES.SURVEY, 4);
    weights.set(MATTHIAS_HOME_STATES.SKEPTICAL, 3);
    weights.set(MATTHIAS_HOME_STATES.LEAN_IN, 5);
  } else if (profile === 'sip' || profile === 'bite') {
    weights.set(MATTHIAS_HOME_STATES.GLANCE_LEFT, 14);
    weights.set(MATTHIAS_HOME_STATES.GLANCE_RIGHT, 14);
    weights.set(MATTHIAS_HOME_STATES.LEAN_IN, 17);
    weights.set(MATTHIAS_HOME_STATES.SKEPTICAL, 21);
  } else if (profile === 'think') {
    weights.set(MATTHIAS_HOME_STATES.SKEPTICAL, 31);
    weights.set(MATTHIAS_HOME_STATES.LEAN_IN, 27);
    weights.set(MATTHIAS_HOME_STATES.SURVEY, 20);
    weights.set(MATTHIAS_HOME_STATES.GLANCE_LEFT, 6);
    weights.set(MATTHIAS_HOME_STATES.GLANCE_RIGHT, 6);
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
