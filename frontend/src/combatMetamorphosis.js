import { setProfileStorageItem } from './profileKeys.js';
import { pieceRankAtLeast, METAMORPHOSIS_MIN_RANK_ID } from './combatRanks.js';

// Metamorfosis de veteranos de Combate.
// Primera iteración deliberadamente estrecha: un PEÓN que alcanza Capitán
// puede convertirse, una sola vez y por elección explícita, en Caballo o
// Alfil. Conserva el id/slot del peón, sus stats, XP e historial; únicamente
// cambia la clase con la que aparece y se mueve en el tablero.
//
// Esto jamás se aplica al ajedrez normal, torneos o puzzles: sólo al motor
// de Combate (incluido Roguelike), que ya admite reglas mutantes.

const ROSTER_KEY = 'chess-study-combat-roster';
export const PAWN_METAMORPHOSIS_CHOICES = ['n', 'b'];
export const METAMORPHOSIS_LABELS = { n: 'Caballo', b: 'Alfil' };

function levelFromSaved(piece) {
  return 1 + Math.max(0, Number(piece?.strengthPoints) || 0) + Math.max(0, Number(piece?.speedPoints) || 0);
}

function originRosterKey(piece) {
  const parts = String(piece?.id || '').split('-');
  const type = parts[1];
  const startSquare = parts[2];
  if (!type || !startSquare) return null;
  return `${type}-${startSquare[0]}`;
}

export function canMetamorphoseRosterPiece(key, saved) {
  if (!String(key || '').startsWith('p-')) return false;
  if (!saved || saved.alive === false || saved.metamorphosis) return false;
  return pieceRankAtLeast(levelFromSaved(saved), METAMORPHOSIS_MIN_RANK_ID);
}

export function metamorphoseRosterPiece(rosterState, key, targetType) {
  if (!PAWN_METAMORPHOSIS_CHOICES.includes(targetType)) return rosterState;
  const saved = rosterState?.pieces?.[key];
  if (!canMetamorphoseRosterPiece(key, saved)) return rosterState;
  return {
    ...rosterState,
    pieces: {
      ...rosterState.pieces,
      [key]: { ...saved, metamorphosis: targetType },
    },
  };
}

export function persistMetamorphosedRoster(state) {
  setProfileStorageItem(ROSTER_KEY, JSON.stringify(state));
  return state;
}

// Mutamos la posición de chess.js ANTES de guardar el FEN inicial de la
// batalla, y mutamos el registro manteniendo su `id` original. Eso es lo que
// permite que un antiguo peón se mueva legalmente como alfil/caballo sin
// perder su identidad de veterano `p-a`, `p-b`, etc.
export function applyRosterMetamorphosesToPosition(chess, registry, rosterState, humanColor) {
  const next = { ...registry };
  for (const [square, piece] of Object.entries(registry || {})) {
    if (!piece || piece.color !== humanColor || piece.type !== 'p') continue;
    const key = originRosterKey(piece);
    const saved = key ? rosterState?.pieces?.[key] : null;
    const targetType = saved?.metamorphosis;
    if (!PAWN_METAMORPHOSIS_CHOICES.includes(targetType) || saved?.alive === false) continue;

    const boardPiece = chess.get(square);
    if (!boardPiece || boardPiece.color !== humanColor || boardPiece.type !== 'p') continue;
    chess.remove(square);
    const placed = chess.put({ type: targetType, color: humanColor }, square);
    if (!placed) {
      chess.put(boardPiece, square);
      continue;
    }
    next[square] = { ...piece, type: targetType, metamorphosis: targetType };
  }
  return next;
}
