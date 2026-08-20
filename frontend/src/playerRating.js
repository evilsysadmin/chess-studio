import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';

// playerRating.js — Estimación de nivel del jugador tipo ELO, calculada a
// partir de tus resultados contra la CPU en Torneo y en Combate (los dos
// modos donde juegas contra una dificultad conocida de 0 a 100). Es la
// versión "cómo te percibe la CPU" que se muestra siempre en la cabecera.
//
// Es un ELO simplificado: le ganas a un rival con rating alto, subes
// bastante; le ganas a uno flojo, subes poco; perder contra algo débil te
// baja más que perder contra algo fuerte. Nada de esto afecta al juego en
// sí — es puramente informativo/de flavor.

const RATING_KEY = 'chess-study-player-rating';
const RATING_HISTORY_KEY = 'chess-study-rating-history';
const MAX_HISTORY_POINTS = 200; // no hace falta guardar miles de puntos para un gráfico chico
// Arrancar en 800 ponía a cualquiera que nunca jugó ya en "Aficionado", a un
// solo punto de "Intermedio" — no se sentía a "recién empezando". 600 caía
// sólido dentro de "Principiante", pero seguía sin resolver el problema real:
// la CPU no sabe nada de un jugador nuevo. Ahora arranca justo en el PISO
// (`Math.max(400, ...)` en updateRating) — con la fórmula real: cualquier
// victoria da entre +18 y +24 según la dureza del rival, mientras que una
// derrota casi no mueve nada (el piso la achica). Un jugador bueno sube
// rápido con cada victoria; uno que todavía no está listo se queda
// estacionado en 400 sin seguir bajando — no hay "más abajo" a donde ir.
const DEFAULT_RATING = 400;
const K_FACTOR = 24;
// Rating "provisional" (mismo concepto que usan FIDE/USCF de verdad): la
// CPU todavía no sabe nada de ti en tus primeros partidos, así que se
// mueve el doble de rápido — se estabiliza al K_FACTOR normal después de
// PROVISIONAL_GAMES partidos, cuando ya hay señal suficiente acumulada.
const PROVISIONAL_K_FACTOR = 48;
const PROVISIONAL_GAMES = 12;

// Única fuente de verdad de las categorías — de acá sale tanto la etiqueta
// (ratingLabel) como el detalle completo que se muestra al hacer clic en el
// chip de la cabecera (qué categoría es cada una, y dónde caes tú).
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
    const raw = localStorage.getItem(RATING_KEY);
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

export function resetRating() {
  removeProfileStorageItem(RATING_KEY);
  return emptyState();
}

// Historial de rating para el gráfico de evolución — una foto {date,
// rating} cada vez que el rating cambia. A propósito NO se reconstruye
// retroactivamente desde el historial de partidas: Combate también cambia
// el rating pero no guarda un historial de jugadas, así que una
// reconstrucción "desde ya" quedaría incompleta y el último punto no
// coincidiría con tu rating real. Se graba desde cero a partir de ahora, en
// los 3 lugares donde el rating cambia (torneo, partida normal, combate).
export function loadRatingHistory() {
  try {
    const raw = localStorage.getItem(RATING_HISTORY_KEY);
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

// Traduce la dificultad de la CPU (0-100) a un rating equivalente, para
// poder compararla contra el rating del jugador con la fórmula de ELO.
function cpuRatingForDifficulty(difficulty) {
  return 600 + difficulty * 12; // nivel 0 -> 600, nivel 100 -> 1800
}

// Actualiza el rating tras una partida contra la CPU a una dificultad dada.
// `score` es 1 (ganaste), 0.5 (tablas) o 0 (perdiste).
export function updateRating(state, cpuDifficulty, score) {
  const cpuRating = cpuRatingForDifficulty(cpuDifficulty);
  const expected = 1 / (1 + Math.pow(10, (cpuRating - state.rating) / 400));
  const k = state.games < PROVISIONAL_GAMES ? PROVISIONAL_K_FACTOR : K_FACTOR;
  const nextRating = Math.round(state.rating + k * (score - expected));
  return { rating: Math.max(400, nextRating), games: state.games + 1 };
}

// Etiqueta legible para el rating numérico.
export function ratingLabel(rating) {
  return tierFor(rating).label;
}

// Todo lo que necesita el modal de detalle: la categoría actual, cuánto
// falta para la siguiente, y qué tan avanzado estás dentro de la actual (en
// %, para una barra de progreso).
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

// Traduce el rating a una dificultad de CPU 0-100 — la usa Modo Combate
// para que el rival se ajuste solo a "cómo te ve la CPU" en vez de
// elegirlo tú con un slider. Lineal (no como la curva de raíz cuadrada
// del torneo): el rating ya es una medida continua de habilidad en sí
// misma, no necesita una curva aparte para repartir la progresión.
// rating 200 (piso teórico) -> dificultad 0. rating 400 (con el que
// arranca cualquiera, justo en el piso real de updateRating) -> ~11, muy
// accesible. rating 2000+ -> tope en 100.
export function difficultyForRating(rating) {
  return Math.max(0, Math.min(100, Math.round((rating - 200) / 18)));
}
