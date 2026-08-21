import { setProfileStorageItem } from './profileKeys.js';
import { pieceRankAtLeast } from './combatRanks.js';

// Metamorfosis = LOADOUT de batalla, no evolución irreversible. La identidad
// y la clase de origen nunca cambian. Se elige en la pantalla prebatalla y
// queda congelada durante esa batalla.
const ROSTER_KEY = 'chess-study-combat-roster';
export const METAMORPHOSIS_LABELS = { p: 'Peón', n: 'Caballo', b: 'Alfil', r: 'Torre', q: 'Dama' };

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

export function unlockedDeploymentTypes(key, saved) {
  const original = String(key || '').split('-')[0];
  if (!saved || saved.alive === false) return [original];
  // Primera versión deliberadamente conservadora: sólo los peones rompen su
  // clase y los desbloqueos empiezan en Comandante, no en Capitán.
  if (original !== 'p') return [original];
  const level = levelFromSaved(saved);
  const choices = ['p'];
  if (pieceRankAtLeast(level, 'commander')) choices.push('n');
  if (pieceRankAtLeast(level, 'colonel')) choices.push('b');
  if (pieceRankAtLeast(level, 'general')) choices.push('r');
  return choices;
}

export function canChooseDeploymentType(key, saved, targetType) {
  return unlockedDeploymentTypes(key, saved).includes(targetType);
}

export function setRosterDeploymentType(rosterState, key, targetType) {
  const saved = rosterState?.pieces?.[key];
  const original = String(key || '').split('-')[0];
  if (!saved || !canChooseDeploymentType(key, saved, targetType)) return rosterState;
  const deploymentType = targetType === original ? null : targetType;
  return {
    ...rosterState,
    pieces: { ...rosterState.pieces, [key]: { ...saved, deploymentType, metamorphosis: undefined } },
  };
}

export function persistMetamorphosedRoster(state) {
  setProfileStorageItem(ROSTER_KEY, JSON.stringify(state));
  return state;
}

export function applyRosterMetamorphosesToPosition(chess, registry, rosterState, humanColor) {
  const next = { ...registry };
  for (const [square, piece] of Object.entries(registry || {})) {
    if (!piece || piece.color !== humanColor) continue;
    const key = originRosterKey(piece);
    const saved = key ? rosterState?.pieces?.[key] : null;
    const targetType = saved?.deploymentType;
    if (!targetType || !canChooseDeploymentType(key, saved, targetType)) continue;

    const boardPiece = chess.get(square);
    if (!boardPiece || boardPiece.color !== humanColor) continue;
    chess.remove(square);
    const placed = chess.put({ type: targetType, color: humanColor }, square);
    if (!placed) {
      chess.put(boardPiece, square);
      continue;
    }
    next[square] = { ...piece, type: targetType, deploymentType: targetType };
  }
  return next;
}
