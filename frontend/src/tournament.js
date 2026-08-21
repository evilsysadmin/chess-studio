import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';

// tournament.js — Progreso del modo torneo. Se guarda en la caché local síncrona y la capa de perfil la
// sincroniza con MongoDB. Así las funciones siguen siendo rápidas y simples
// para React sin convertir cada cambio de puntos en una llamada bloqueante.

const STORAGE_KEY = 'chess-study-tournament';
export const POINTS_PER_LEVEL = 50;

const EMPTY_STATE = { points: 0, progressPoints: 0, wins: 0, draws: 0, losses: 0, winStreak: 0, bestWinStreak: 0 };

export function loadTournament() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_STATE };
    const parsed = JSON.parse(raw);
    // Migración V16.6: antes `points` era a la vez moneda de pistas y XP de
    // torneo. Conservamos el nivel histórico una vez, pero a partir de ahora
    // ambas economías avanzan por caminos independientes.
    const progressPoints = Number.isFinite(Number(parsed.progressPoints))
      ? Number(parsed.progressPoints)
      : Number(parsed.points) || 0;
    return { ...EMPTY_STATE, ...parsed, progressPoints };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function saveTournament(state) {
  setProfileStorageItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetTournament() {
  removeProfileStorageItem(STORAGE_KEY);
  return { ...EMPTY_STATE };
}

// Nivel del torneo (1, 2, 3…) según los puntos totales acumulados.
export function levelForPoints(points) {
  return Math.floor(points / POINTS_PER_LEVEL) + 1;
}

// Cuántos puntos lleva dentro del nivel actual (para la barra de progreso).
export function pointsIntoLevel(points) {
  return points % POINTS_PER_LEVEL;
}

// Traduce el nivel del torneo a dificultad CPU 0–100. El motor V16.x es
// bastante más serio que cuando nació la curva anterior (alpha-beta + TT +
// quiescence y sin azar bruto en Intermedio), así que V16.6 la recalibra un
// hacia abajo. El nivel ~24 pasa del antiguo ~62 a ~48: el torneo conserva
// progresión, pero no mete al jugador aficionado en el tramo Intermedio duro
// demasiado pronto. El techo se alcanza mucho más tarde, alrededor del 101.
export function difficultyForLevel(level) {
  return Math.min(100, Math.round(10 * Math.sqrt(Math.max(0, level - 1))));
}

// Coste en puntos de pedir una pista, dado el nivel del torneo y cuántas
// pistas ya se pidieron EN ESTA PARTIDA (se resetea cada partida nueva — si
// escalara para siempre, después de gastar de más quedarías sin poder pagar
// una pista nunca más). El nivel influye en la base porque en niveles altos
// una pista vale más (el motor te está salvando de un rival más peligroso);
// el uso repetido dentro de la misma partida escala multiplicativamente para
// desalentar apoyarte en pistas todo el tiempo.
export function hintCost(level, hintsUsedInGame) {
  const base = 3 + Math.floor(level / 2);
  return base * (hintsUsedInGame + 1);
}

// Costo de "proteger" un error en Puzzle sin romper la racha — mismo
// criterio que hintCost: una base fija, más caro cuanto más larga la
// racha que se está protegiendo (tiene más sentido pagar por salvar una
// racha de 20 que una de 1, y el costo creciente lo refleja).
export function puzzleRetryCost(currentStreak) {
  return 8 + currentStreak * 2;
}

// Valor de cada pieza en puntos de torneo (escala clásica de ajedrez, no
// centipawns): peón 1, caballo/alfil 3, torre 5, dama 9.
const PIECE_POINT_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };

// Puntos que da capturar una pieza de la CPU. Dos factores:
//  - el valor de la pieza capturada (comerte la dama vale más que un peón).
//  - un bono por "buena captura": si la pieza que captura vale MENOS que la
//    capturada (p. ej. un peón se come una torre), se suma la diferencia —
//    ese tipo de captura suele ser la más difícil de conseguir y merece más
//    puntos. Si es al revés (la dama se come un peón suelto), no hay bono.
// Todo eso se multiplica por el nivel del torneo: en niveles altos, cada
// pieza que le sacas a una CPU más fuerte vale más.
export function capturePoints(capturingPieceType, capturedPieceType, level) {
  const capturedValue = PIECE_POINT_VALUES[capturedPieceType] || 0;
  const capturingValue = PIECE_POINT_VALUES[capturingPieceType] || 0;
  const tradeBonus = Math.max(0, capturedValue - capturingValue);
  const levelMultiplier = 1 + Math.floor(level / 10);
  return Math.round((capturedValue + tradeBonus) * levelMultiplier);
}

// Bono por racha de capturas: cada captura tuya seguida, sin que la CPU te
// haya comido una pieza en el medio, suma un extra creciente. `streakCount`
// es cuántas capturas lleva la racha CONTANDO esta (2 = es la segunda
// seguida, 3 = la tercera...). La racha se corta apenas la CPU te captura algo.
export function streakBonus(streakCount, level) {
  if (streakCount < 2) return 0;
  const levelMultiplier = 1 + Math.floor(level / 10);
  return (streakCount - 1) * 2 * levelMultiplier;
}

// Las capturas alimentan SOLO la cartera de pistas. No alteran XP/nivel de
// torneo y, por supuesto, jamás tocan el rating ELO. Esto evita que capturar
// una dama te empuje sin querer a una CPU más fuerte y que gastar una pista
// pueda hacerte bajar de nivel.
export function applyCaptureReward(state, gained) {
  const amount = Math.max(0, Math.round(Number(gained) || 0));
  return { ...state, points: (state.points || 0) + amount };
}

// Aplica el resultado de una partida al estado del torneo. No penaliza las
// derrotas (siempre se puede reintentar): victoria +20, tablas +5, derrota +0.
export function applyResult(state, outcome) {
  const gained = outcome === 'win' ? 20 : outcome === 'draw' ? 5 : 0;
  const priorProgress = Number.isFinite(Number(state.progressPoints)) ? Number(state.progressPoints) : Number(state.points) || 0;
  const prevLevel = levelForPoints(priorProgress);
  const points = state.points || 0;
  const progressPoints = priorProgress + gained;
  const winStreak = outcome === 'win' ? (state.winStreak || 0) + 1 : 0;
  const bestWinStreak = Math.max(state.bestWinStreak || 0, winStreak);
  const next = {
    points,
    progressPoints,
    wins: state.wins + (outcome === 'win' ? 1 : 0),
    draws: state.draws + (outcome === 'draw' ? 1 : 0),
    losses: state.losses + (outcome === 'loss' ? 1 : 0),
    winStreak,
    bestWinStreak,
  };
  const newLevel = levelForPoints(progressPoints);
  return { state: next, gained, leveledUp: newLevel > prevLevel, newLevel };
}
