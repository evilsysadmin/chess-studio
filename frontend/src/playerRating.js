import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';
import { loadGameActivity } from './gameActivity.js';

// playerRating.js — Estimación de nivel del jugador tipo ELO, calculada a
// partir de tus partidas normales y de Torneo contra una dificultad conocida.
// Práctica y Combate no cuentan: una regala pistas y el otro mete azar en las
// capturas, así que ambos contaminarían la señal de nivel ajedrecístico. Es la
// versión "cómo te percibe la CPU" que se muestra siempre en la cabecera.
//
// Es un ELO simplificado: le ganas a un rival con rating alto, subes
// bastante; le ganas a uno flojo, subes poco; perder contra algo débil te
// baja más que perder contra algo fuerte. El rating sigue siendo historial de
// fuerza estimada; la dificultad automática añade además una corrección de
// forma reciente para no machacar a un perfil legacy cuyo rating esté inflado.

const RATING_KEY = 'chess-study-player-rating';
const RATING_HISTORY_KEY = 'chess-study-rating-history';
const MAX_HISTORY_POINTS = 200;
const DEFAULT_RATING = 400;
const K_FACTOR = 24;
const PROVISIONAL_K_FACTOR = 48;
export const PROVISIONAL_GAMES = 12;

// La forma reciente sólo afecta a la SIGUIENTE partida automática: jamás
// hacemos rubber-banding dentro de una partida ya empezada.
const ADAPTIVE_RECENT_GAMES = 8;
const ADAPTIVE_DIFFICULTY_BAND = 25;
const ADAPTIVE_MIN_ADJUSTMENT = -22;
const ADAPTIVE_MAX_ADJUSTMENT = 8;
const ADAPTIVE_ABANDON_SCORE = 0.15;
const PROVISIONAL_MAX_RELIEF = 10;

export const RATING_TIERS = [
  { label: 'Principiante', min: 0, max: 699 },
  { label: 'Aficionado', min: 700, max: 999 },
  { label: 'Intermedio', min: 1000, max: 1299 },
  { label: 'Avanzado', min: 1300, max: 1599 },
  { label: 'Experto', min: 1600, max: 1899 },
  { label: 'Maestro', min: 1900, max: Infinity },
];

function tierFor(rating) {
  return RATING_TIERS.find((t) => rating >= t.min && rating <= t.max) || RATING_TIERS[RATING_TIERS.length - 1];
}

function emptyState() {
  return { rating: DEFAULT_RATING, games: 0 };
}

export function loadRating() {
  try {
    const raw = getStorageItem(STORAGE_LOCAL, RATING_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    return { rating: parsed.rating ?? DEFAULT_RATING, games: parsed.games || 0 };
  } catch {
    return emptyState();
  }
}

export function saveRating(state) {
  setProfileStorageItem(RATING_KEY, JSON.stringify(state));
}

export function loadRatingHistory() {
  try {
    const raw = getStorageItem(STORAGE_LOCAL, RATING_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordRatingHistory(rating) {
  const history = loadRatingHistory();
  history.push({ date: new Date().toISOString(), rating });
  const trimmed = history.slice(-MAX_HISTORY_POINTS);
  setProfileStorageItem(RATING_HISTORY_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function resetRatingHistory() {
  removeProfileStorageItem(RATING_HISTORY_KEY);
  return [];
}

function validRatingPoint(point) {
  const time = new Date(point?.date).getTime();
  const rating = Number(point?.rating);
  return Number.isFinite(time) && Number.isFinite(rating) ? { ...point, time, rating } : null;
}

function periodCheckpoint(points, cutoff, label) {
  const current = points[points.length - 1];
  const previous = [...points].reverse().find((point) => point.time < cutoff);
  const periodPoints = points.filter((point) => point.time >= cutoff);
  const baseline = previous || periodPoints[0] || current;
  return {
    label,
    delta: current.rating - baseline.rating,
    games: periodPoints.length,
    rating: current.rating,
    hasData: periodPoints.length > 0,
  };
}

export function ratingPeriodCheckpoints(history = [], now = new Date()) {
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const points = history
    .map(validRatingPoint)
    .filter(Boolean)
    .filter((point) => point.time <= nowTime)
    .sort((a, b) => a.time - b.time);
  if (!points.length || !Number.isFinite(nowTime)) return [];

  const startOfToday = new Date(nowTime);
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  return [
    periodCheckpoint(points, startOfToday.getTime(), 'Hoy'),
    periodCheckpoint(points, nowTime - (7 * dayMs), '7 días'),
    periodCheckpoint(points, nowTime - (30 * dayMs), '30 días'),
  ];
}

const CPU_RATING_ANCHORS = [
  [0, 450],
  [20, 650],
  [45, 900],
  [60, 1100],
  [70, 1275],
  [90, 1600],
  [100, 1800],
];

export function cpuRatingForDifficulty(rawDifficulty) {
  const difficulty = Math.max(0, Math.min(100, Number(rawDifficulty) || 0));
  for (let i = 1; i < CPU_RATING_ANCHORS.length; i += 1) {
    const [rightDifficulty, rightRating] = CPU_RATING_ANCHORS[i];
    const [leftDifficulty, leftRating] = CPU_RATING_ANCHORS[i - 1];
    if (difficulty <= rightDifficulty) {
      const span = rightDifficulty - leftDifficulty || 1;
      const t = (difficulty - leftDifficulty) / span;
      return Math.round(leftRating + (rightRating - leftRating) * t);
    }
  }
  return CPU_RATING_ANCHORS[CPU_RATING_ANCHORS.length - 1][1];
}

export function ratingScoreForOutcome(outcome) {
  return outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
}

export function ratingChangeDetails(state, cpuDifficulty, score) {
  const cpuRating = cpuRatingForDifficulty(cpuDifficulty);
  const expected = 1 / (1 + Math.pow(10, (cpuRating - state.rating) / 400));
  const k = state.games < PROVISIONAL_GAMES ? PROVISIONAL_K_FACTOR : K_FACTOR;
  const unclamped = Math.round(state.rating + k * (score - expected));
  const nextRating = Math.max(400, unclamped);
  return {
    next: { rating: nextRating, games: state.games + 1 },
    delta: nextRating - state.rating,
    cpuRating,
    expectedScore: expected,
    kFactor: k,
  };
}

export function updateRating(state, cpuDifficulty, score) {
  return ratingChangeDetails(state, cpuDifficulty, score).next;
}

export function ratingLabel(rating) {
  return tierFor(rating).label;
}

export function ratingProgress(rating) {
  const tier = tierFor(rating);
  const isMaxTier = tier.max === Infinity;
  const span = isMaxTier ? null : tier.max - tier.min + 1;
  const into = rating - tier.min;
  const pct = isMaxTier ? 100 : Math.max(0, Math.min(100, Math.round((into / span) * 100)));
  return {
    tier,
    isMaxTier,
    pointsIntoTier: into,
    pointsToNextTier: isMaxTier ? null : tier.max - rating + 1,
    progressPct: pct,
  };
}

function baseDifficultyForRating(rating) {
  return Math.max(0, Math.min(100, Math.round((Number(rating) - 200) / 18)));
}

export function provisionalDifficultyRelief(games = PROVISIONAL_GAMES) {
  const count = Number(games);
  if (!Number.isFinite(count) || count >= PROVISIONAL_GAMES) return 0;
  const progress = Math.max(0, Math.min(1, count / PROVISIONAL_GAMES));
  return Math.round(PROVISIONAL_MAX_RELIEF * (1 - progress));
}

function isDifficultyRelevant(event, baseDifficulty) {
  const difficulty = Number(event?.difficulty);
  if (!Number.isFinite(difficulty)) return false;

  // La evidencia es deliberadamente asimétrica. Perder a un nivel MUCHO más
  // bajo que el que propone el rating es una señal muy fuerte de que el perfil
  // legacy está inflado y debe contar. En cambio, perder porque el usuario se
  // puso voluntariamente una CPU 40 puntos más fuerte no debe bajar el auto.
  if (event?.outcome === 'loss') return difficulty <= baseDifficulty + ADAPTIVE_DIFFICULTY_BAND;
  // Ganar por encima de la propuesta sí demuestra nivel; machacar una CPU muy
  // inferior no sirve para subir el automático.
  if (event?.outcome === 'win') return difficulty >= baseDifficulty - ADAPTIVE_DIFFICULTY_BAND;
  return Math.abs(difficulty - baseDifficulty) <= ADAPTIVE_DIFFICULTY_BAND;
}

function competitiveAdaptiveEvents(activity, baseDifficulty) {
  const rows = Array.isArray(activity) ? activity : [];
  const adaptiveStarts = new Map(
    rows
      .filter((event) => event?.state === 'started' && event?.detail === 'adaptive-difficulty')
      .map((event) => [event.gameId, event]),
  );

  return rows
    .map((event) => {
      if (event?.state === 'finished' && ['win', 'draw', 'loss'].includes(event?.outcome)) return event;
      // Un abandono explícito antes de perder material puede no tocar el ELO,
      // pero repetirlo contra la dificultad automática sí es señal útil de que
      // el reto estaba por encima del usuario. Lo tratamos como derrota suave,
      // sólo para elegir la SIGUIENTE CPU y sin reescribir rating/historial.
      if (event?.state === 'cancelled' && adaptiveStarts.has(event?.gameId)) {
        const started = adaptiveStarts.get(event.gameId);
        return {
          ...event,
          difficulty: Number.isFinite(Number(event?.difficulty)) ? Number(event.difficulty) : Number(started?.difficulty),
          outcome: 'loss',
          adaptiveAbandon: true,
        };
      }
      return null;
    })
    .filter(Boolean)
    .filter((event) => ['casual', 'tournament'].includes(event?.mode))
    .filter((event) => isDifficultyRelevant(event, baseDifficulty))
    .slice(0, ADAPTIVE_RECENT_GAMES);
}

function adaptiveScore(event) {
  if (event?.adaptiveAbandon) return ADAPTIVE_ABANDON_SCORE;
  return ratingScoreForOutcome(event?.outcome);
}

/**
 * Corrección de forma reciente aplicada sólo a la dificultad automática.
 * En perfiles provisionales una derrota ya hace bajar un poco la SIGUIENTE
 * CPU y dos derrotas consecutivas bajan claramente el reto. Un perfil ya
 * establecido conserva la muestra mínima histórica de tres partidas.
 */
export function adaptiveDifficultyAdjustment(activity = [], baseDifficulty = 0, allowEarlyDrop = false) {
  const recent = competitiveAdaptiveEvents(activity, baseDifficulty);
  if (!recent.length) return 0;

  let lossStreak = 0;
  for (const event of recent) {
    if (event.outcome !== 'loss') break;
    lossStreak += 1;
  }

  if (recent.length < 3 && !allowEarlyDrop) return 0;
  if (recent.length === 1) return lossStreak === 1 ? -5 : 0;
  if (recent.length === 2) {
    if (lossStreak >= 2) return -9;
    const performance = (adaptiveScore(recent[0]) * 2 + adaptiveScore(recent[1])) / 3;
    return performance <= 0.25 ? -5 : 0;
  }

  // gameActivity está newest-first. Damos algo más de peso a lo ocurrido ayer
  // que a una partida antigua de esta ventana corta.
  let weightedScore = 0;
  let weightTotal = 0;
  recent.forEach((event, index) => {
    const weight = Math.max(1, recent.length - index);
    weightedScore += adaptiveScore(event) * weight;
    weightTotal += weight;
  });
  const performance = weightTotal ? weightedScore / weightTotal : 0.5;

  let adjustment = 0;
  if (performance <= 0.20) adjustment = -16;
  else if (performance <= 0.35) adjustment = -11;
  else if (performance <= 0.45) adjustment = -6;
  else if (performance >= 0.80) adjustment = 6;
  else if (performance >= 0.68) adjustment = 3;

  if (lossStreak >= 5) adjustment -= 8;
  else if (lossStreak >= 4) adjustment -= 6;
  else if (lossStreak >= 3) adjustment -= 4;

  return Math.max(ADAPTIVE_MIN_ADJUSTMENT, Math.min(ADAPTIVE_MAX_ADJUSTMENT, adjustment));
}

// Traduce el rating a dificultad y añade dos correcciones deliberadamente
// asimétricas: durante las 12 partidas provisionales ofrece una CPU algo más
// amable y reacciona antes a derrotas, pero sube despacio. `games` es opcional
// para conservar compatibilidad con llamadas históricas.
export function difficultyForRating(rating, activity = null, games = PROVISIONAL_GAMES) {
  const historicalBase = baseDifficultyForRating(rating);
  const provisional = Number.isFinite(Number(games)) && Number(games) < PROVISIONAL_GAMES;
  const base = Math.max(0, historicalBase - provisionalDifficultyRelief(games));
  const recent = activity == null ? loadGameActivity() : activity;
  return Math.max(0, Math.min(100, base + adaptiveDifficultyAdjustment(recent, base, provisional)));
}
