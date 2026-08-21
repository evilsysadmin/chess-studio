// mirrorMode.js — Rival Fantasma.
//
// La primera versión del "espejo" sólo calibraba la dificultad a partir del
// tamaño medio de los peores errores analizados. Esta versión conserva esa
// señal, pero añade un perfil de ESTILO obtenido exclusivamente de partidas
// reales archivadas: frecuencia de capturas, movimientos de peón/dama,
// jaques y enroques. El backend usa esos sesgos únicamente como desempate
// entre jugadas de evaluación muy próxima; nunca como permiso para regalar
// material deliberadamente.

import { loadWorstMoveCache } from './worstMoveCache.js';
import { loadGameHistory, isCompetitiveHistoryRecord } from './gameHistory.js';

const MIN_GAMES_FOR_ERROR_PROFILE = 3;
const MIN_GAMES_FOR_STYLE_PROFILE = 3;
const MAX_STYLE_GAMES = 40;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const roundPct = (value) => Math.round(value * 100);

// Referencias conservadoras, no "normas universales" de ajedrez. Sólo sirven
// para convertir una tasa observada en un sesgo -1..+1 que el motor usa como
// desempate. Cerca de la referencia el sesgo queda casi neutro.
const STYLE_BASELINES = Object.freeze({
  captureRate: { center: 0.18, span: 0.12 },
  pawnRate: { center: 0.42, span: 0.18 },
  queenRate: { center: 0.08, span: 0.08 },
  checkRate: { center: 0.07, span: 0.07 },
  castleRate: { center: 0.55, span: 0.35 },
});

function bias(value, baseline) {
  return clamp((value - baseline.center) / baseline.span, -1, 1);
}


function movePiece(move) {
  const explicit = String(move?.piece || '').toLowerCase();
  if (['p', 'n', 'b', 'r', 'q', 'k'].includes(explicit)) return explicit;
  const san = String(move?.san || '').replace(/^[+#?!]+/, '');
  if (/^O-O(?:-O)?/.test(san)) return 'k';
  const first = san.charAt(0).toUpperCase();
  return ({ N: 'n', B: 'b', R: 'r', Q: 'q', K: 'k' })[first] || 'p';
}

function moveCaptured(move) {
  if (typeof move?.captured === 'boolean') return move.captured;
  return String(move?.san || '').includes('x');
}

function humanMovesForRecord(record) {
  if (!record || !Array.isArray(record.moves) || !['w', 'b'].includes(record.humanColor)) return [];
  // Las posiciones arrancadas desde FEN pueden empezar con cualquiera de los
  // bandos y romper la paridad estándar. Son entrenamiento/lab y no hacen
  // falta para perfilar el estilo normal del jugador.
  if (record.initialFen) return [];
  const parity = record.humanColor === 'w' ? 0 : 1;
  return record.moves.filter((_, index) => index % 2 === parity);
}

export function deriveMirrorStyle(history = []) {
  const records = (Array.isArray(history) ? history : [])
    .filter((record) => isCompetitiveHistoryRecord(record))
    .filter((record) => !record?.initialFen)
    .slice(0, MAX_STYLE_GAMES)
    .map((record) => ({ record, humanMoves: humanMovesForRecord(record) }))
    .filter(({ humanMoves }) => humanMoves.length >= 4);

  if (records.length < MIN_GAMES_FOR_STYLE_PROFILE) {
    return {
      ready: false,
      gamesSampled: records.length,
      movesSampled: records.reduce((sum, row) => sum + row.humanMoves.length, 0),
      metrics: null,
      style: null,
      traits: [],
      confidence: 'insuficiente',
    };
  }

  let totalMoves = 0;
  let captures = 0;
  let pawnMoves = 0;
  let queenMoves = 0;
  let checks = 0;
  let castledGames = 0;

  for (const { humanMoves } of records) {
    let castled = false;
    for (const move of humanMoves) {
      totalMoves += 1;
      if (moveCaptured(move)) captures += 1;
      if (movePiece(move) === 'p') pawnMoves += 1;
      if (movePiece(move) === 'q') queenMoves += 1;
      const san = String(move?.san || '');
      if (/[+#]$/.test(san)) checks += 1;
      if (/^O-O(?:-O)?[+#]?$/.test(san)) castled = true;
    }
    if (castled) castledGames += 1;
  }

  const raw = {
    captureRate: captures / totalMoves,
    pawnRate: pawnMoves / totalMoves,
    queenRate: queenMoves / totalMoves,
    checkRate: checks / totalMoves,
    castleRate: castledGames / records.length,
  };

  // Con sólo tres partidas una tasa 0%/100% no debe convertirse en una
  // certeza absoluta. Regularizamos hacia una referencia neutra con una
  // pequeña muestra previa y dejamos que el historial real gane peso a
  // medida que crece. Las métricas que mostramos siguen siendo las OBSERVADAS.
  const movePrior = 24;
  const gamePrior = 4;
  const regularized = {
    captureRate: (captures + STYLE_BASELINES.captureRate.center * movePrior) / (totalMoves + movePrior),
    pawnRate: (pawnMoves + STYLE_BASELINES.pawnRate.center * movePrior) / (totalMoves + movePrior),
    queenRate: (queenMoves + STYLE_BASELINES.queenRate.center * movePrior) / (totalMoves + movePrior),
    checkRate: (checks + STYLE_BASELINES.checkRate.center * movePrior) / (totalMoves + movePrior),
    castleRate: (castledGames + STYLE_BASELINES.castleRate.center * gamePrior) / (records.length + gamePrior),
  };

  const style = {
    capture: Number(bias(regularized.captureRate, STYLE_BASELINES.captureRate).toFixed(3)),
    pawn: Number(bias(regularized.pawnRate, STYLE_BASELINES.pawnRate).toFixed(3)),
    queen: Number(bias(regularized.queenRate, STYLE_BASELINES.queenRate).toFixed(3)),
    check: Number(bias(regularized.checkRate, STYLE_BASELINES.checkRate).toFixed(3)),
    castle: Number(bias(regularized.castleRate, STYLE_BASELINES.castleRate).toFixed(3)),
  };

  const traitCandidates = [
    { key: 'capture', score: Math.abs(style.capture), pos: 'busca cambios y capturas', neg: 'evita cambios cuando puede' },
    { key: 'pawn', score: Math.abs(style.pawn), pos: 'mueve muchos peones', neg: 'activa piezas antes que peones' },
    { key: 'queen', score: Math.abs(style.queen), pos: 'usa bastante la dama', neg: 'mantiene la dama contenida' },
    { key: 'check', score: Math.abs(style.check), pos: 'busca jaques con frecuencia', neg: 'presiona sin abusar del jaque' },
    { key: 'castle', score: Math.abs(style.castle), pos: 'suele enrocar', neg: 'enroca poco' },
  ]
    .filter((row) => row.score >= 0.22)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((row) => (style[row.key] >= 0 ? row.pos : row.neg));

  return {
    ready: true,
    gamesSampled: records.length,
    movesSampled: totalMoves,
    metrics: {
      captures: roundPct(raw.captureRate),
      pawns: roundPct(raw.pawnRate),
      queens: roundPct(raw.queenRate),
      checks: roundPct(raw.checkRate),
      castles: roundPct(raw.castleRate),
    },
    style,
    traits: traitCandidates.length ? traitCandidates : ['estilo bastante equilibrado'],
    confidence: records.length >= 12 ? 'alta' : records.length >= 6 ? 'media' : 'inicial',
  };
}

export function computeMirrorProfile(history = loadGameHistory()) {
  const cache = loadWorstMoveCache();
  const eligibleIds = new Set((Array.isArray(history) ? history : [])
    .filter((record) => isCompetitiveHistoryRecord(record) && !record?.initialFen && record?.id)
    .map((record) => record.id));
  const losses = Object.entries(cache)
    .filter(([id]) => eligibleIds.has(id))
    .map(([, entry]) => entry?.worst?.loss)
    .filter((loss) => typeof loss === 'number' && Number.isFinite(loss));
  const styleProfile = deriveMirrorStyle(history);

  const errorsReady = losses.length >= MIN_GAMES_FOR_ERROR_PROFILE;
  if (!errorsReady || !styleProfile.ready) {
    return {
      ready: false,
      gamesSampled: losses.length,
      styleGamesSampled: styleProfile.gamesSampled,
      avgLoss: null,
      difficulty: null,
      ...styleProfile,
      errorGamesSampled: losses.length,
      ready: false,
    };
  }

  const avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / losses.length;
  return {
    ...styleProfile,
    ready: true,
    errorGamesSampled: losses.length,
    avgLoss: Math.round(avgLoss),
    difficulty: mirrorDifficulty(avgLoss),
  };
}

// Cuanto mayor es la pérdida promedio, más floja la CPU fantasma. Los topes
// evitan extremos absurdos aunque el historial contenga una autopsia salvaje.
export function mirrorDifficulty(avgLoss) {
  return Math.max(5, Math.min(95, Math.round(100 - avgLoss / 5)));
}
