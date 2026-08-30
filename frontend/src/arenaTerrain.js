import { Chess } from 'chess.js';

const VALID_SQUARE = /^[a-h][1-8]$/;
const PIECE_VALUE = Object.freeze({ p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 });
const MATE_SCORE = 100000;

export const ARENA_START_FEN = new Chess().fen();
export const ARENA_BRIDGEHEAD_FEN = 'rnbqkb1r/pppp1ppp/5n2/4p3/3P4/2N5/PPP1PPPP/R1BQKBNR w KQkq - 0 3';

export const ARENA_PRESETS = Object.freeze([
  Object.freeze({
    id: 'breach',
    label: 'La Brecha',
    blocked: Object.freeze(['c4', 'f4', 'c5', 'f5']),
    startFen: ARENA_START_FEN,
    deployment: 'Clásico',
    summary: 'Cuatro pilares parten el centro y dejan dos corredores principales.',
  }),
  Object.freeze({
    id: 'wall',
    label: 'El Muro',
    blocked: Object.freeze(['d4', 'e4', 'd5', 'e5']),
    startFen: ARENA_START_FEN,
    deployment: 'Clásico',
    summary: 'El centro está sellado. El juego debe respirar por los flancos.',
  }),
  Object.freeze({
    id: 'gates',
    label: 'Las Puertas',
    blocked: Object.freeze(['b4', 'g4', 'b5', 'g5', 'd5', 'e4']),
    startFen: ARENA_START_FEN,
    deployment: 'Clásico',
    summary: 'Dos contrafuertes laterales y dos ruinas centrales crean cuellos de botella.',
  }),
  Object.freeze({
    id: 'twin-bridges',
    label: 'Los Dos Puentes',
    blocked: Object.freeze(['a4', 'b4', 'd4', 'e4', 'g4', 'h4', 'a5', 'b5', 'd5', 'e5', 'g5', 'h5']),
    startFen: ARENA_START_FEN,
    deployment: 'Clásico · dos pasos',
    summary: 'Una franja de ruinas deja sólo dos corredores de cruce, por c y f. Controlar el paso importa más que ocupar el centro.',
  }),
  Object.freeze({
    id: 'bridgehead',
    label: 'Cabeza de Puente',
    blocked: Object.freeze(['a4', 'b4', 'g4', 'h4', 'a5', 'b5', 'g5', 'h5']),
    startFen: ARENA_BRIDGEHEAD_FEN,
    deployment: 'Asimétrico · contacto temprano',
    summary: 'La batalla empieza con fuerzas ya desplegadas: blancas han ganado espacio y negras desarrollo. Los bordes cerrados convierten el centro en corredor de contacto.',
  }),
]);

function realChess(fen) {
  return new Chess(fen || ARENA_START_FEN);
}

export function normalizeArenaBlocked(fen, blocked = []) {
  const chess = realChess(fen);
  const result = [];
  const seen = new Set();
  for (const raw of Array.isArray(blocked) ? blocked : []) {
    const square = String(raw || '').toLowerCase();
    if (!VALID_SQUARE.test(square) || seen.has(square)) continue;
    if (chess.get(square)) throw new Error(`El terreno bloqueado ${square} contiene una pieza.`);
    seen.add(square);
    result.push(square);
  }
  return result.sort();
}

function arenaChess(fen, blocked = []) {
  const chess = realChess(fen);
  const normalized = normalizeArenaBlocked(chess.fen(), blocked);
  const color = chess.turn();
  for (const square of normalized) {
    // El obstáculo se representa temporalmente como una pieza inmóvil del
    // bando al turno. Eso hace que chess.js lo trate como sólido para el rey
    // y para rayos de torre/alfil/dama, pero nunca como enemigo capturable.
    // Sus movimientos se filtran antes de salir de este módulo.
    if (!chess.put({ type: 'n', color }, square)) {
      throw new Error(`No se pudo materializar el obstáculo ${square}.`);
    }
  }
  return { chess, blocked: normalized, blockedSet: new Set(normalized) };
}

function arenaMovesFromInjected(chess, blockedSet) {
  return chess.moves({ verbose: true }).filter((move) => !blockedSet.has(move.from) && !blockedSet.has(move.to));
}

export function arenaLegalMoves(fen, blocked = [], { from = null } = {}) {
  const injected = arenaChess(fen, blocked);
  return arenaMovesFromInjected(injected.chess, injected.blockedSet)
    .filter((move) => !from || move.from === from)
    .map((move) => ({
      from: move.from,
      to: move.to,
      color: move.color,
      piece: move.piece,
      captured: move.captured || null,
      promotion: move.promotion || null,
      flags: move.flags || '',
    }));
}

export function arenaPieceAt(fen, square) {
  if (!VALID_SQUARE.test(String(square || ''))) return null;
  return realChess(fen).get(square) || null;
}

export function arenaTurn(fen) {
  return realChess(fen).turn();
}

export function arenaKingSquare(fen, color) {
  const chess = realChess(fen);
  for (const rank of chess.board()) {
    for (const piece of rank) {
      if (piece?.type === 'k' && piece.color === color) return piece.square;
    }
  }
  return null;
}

function stripArenaBlockers(chess, blocked) {
  for (const square of blocked) chess.remove(square);
  return chess.fen();
}

export function arenaApplyMove(fen, blocked = [], move = {}) {
  const injected = arenaChess(fen, blocked);
  const legal = arenaMovesFromInjected(injected.chess, injected.blockedSet);
  const candidate = legal.find((item) => (
    item.from === move.from
    && item.to === move.to
    && (!item.promotion || item.promotion === (move.promotion || 'q'))
  ));
  if (!candidate) return null;

  let applied = null;
  try {
    applied = injected.chess.move({
      from: candidate.from,
      to: candidate.to,
      promotion: candidate.promotion ? (move.promotion || 'q') : undefined,
    });
  } catch {
    return null;
  }
  if (!applied) return null;

  const nextFen = stripArenaBlockers(injected.chess, injected.blocked);
  return {
    fen: nextFen,
    move: {
      from: applied.from,
      to: applied.to,
      color: applied.color,
      piece: applied.piece,
      captured: applied.captured || null,
      promotion: applied.promotion || null,
      flags: applied.flags || '',
    },
  };
}

function basePositionKey(fen) {
  return String(fen || '').trim().split(/\s+/).slice(0, 4).join(' ');
}

export function arenaPositionKey(fen, blocked = []) {
  return `${basePositionKey(fen)}|terrain:${normalizeArenaBlocked(fen, blocked).join(',')}`;
}

export function arenaStatus(fen, blocked = [], historyKeys = []) {
  const injected = arenaChess(fen, blocked);
  const legal = arenaMovesFromInjected(injected.chess, injected.blockedSet);
  const inCheck = injected.chess.isCheck();
  if (!legal.length) return inCheck ? 'checkmate' : 'stalemate';

  const halfmove = Number(String(fen || '').trim().split(/\s+/)[4] || 0);
  if (Number.isFinite(halfmove) && halfmove >= 100) return 'fifty-move';

  const key = arenaPositionKey(fen, blocked);
  const repetitions = (Array.isArray(historyKeys) ? historyKeys : []).filter((item) => item === key).length;
  if (repetitions >= 3) return 'repetition';

  return inCheck ? 'check' : 'playing';
}

function materialBalance(fen, color) {
  const chess = realChess(fen);
  let score = 0;
  for (const rank of chess.board()) {
    for (const piece of rank) {
      if (!piece) continue;
      const value = PIECE_VALUE[piece.type] || 0;
      score += piece.color === color ? value : -value;
    }
  }
  return score;
}

function evaluateFor(fen, blocked, color) {
  const status = arenaStatus(fen, blocked);
  const turn = arenaTurn(fen);
  if (status === 'checkmate') return turn === color ? -MATE_SCORE : MATE_SCORE;
  if (status === 'stalemate' || status === 'fifty-move' || status === 'repetition') return 0;

  let score = materialBalance(fen, color);
  const mobility = arenaLegalMoves(fen, blocked).length;
  score += (turn === color ? mobility : -mobility) * 2;
  if (status === 'check') score += turn === color ? -35 : 35;
  return score;
}

function minimax(fen, blocked, depth, alpha, beta, cpuColor) {
  const status = arenaStatus(fen, blocked);
  if (depth <= 0 || ['checkmate', 'stalemate', 'fifty-move', 'repetition'].includes(status)) {
    return evaluateFor(fen, blocked, cpuColor);
  }

  const moves = arenaLegalMoves(fen, blocked);
  const maximizing = arenaTurn(fen) === cpuColor;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    const applied = arenaApplyMove(fen, blocked, move);
    if (!applied) continue;
    const score = minimax(applied.fen, blocked, depth - 1, alpha, beta, cpuColor);
    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return Number.isFinite(best) ? best : evaluateFor(fen, blocked, cpuColor);
}

export function arenaChooseCpuMove(fen, blocked = [], { depth = 2, randomFn = Math.random } = {}) {
  const cpuColor = arenaTurn(fen);
  const moves = arenaLegalMoves(fen, blocked);
  if (!moves.length) return null;

  let bestScore = -Infinity;
  let bestMoves = [];
  for (const move of moves) {
    const applied = arenaApplyMove(fen, blocked, move);
    if (!applied) continue;
    const score = minimax(applied.fen, blocked, Math.max(0, Number(depth || 1) - 1), -Infinity, Infinity, cpuColor);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }
  if (!bestMoves.length) return moves[0] || null;
  const roll = Number(typeof randomFn === 'function' ? randomFn() : 0);
  const safeRoll = Number.isFinite(roll) ? Math.min(0.999999, Math.max(0, roll)) : 0;
  return bestMoves[Math.floor(safeRoll * bestMoves.length)] || bestMoves[0];
}
