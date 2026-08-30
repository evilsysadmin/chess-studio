import { Chess } from 'chess.js';

const OBJECTIVES = Object.freeze({
  'twin-bridges': Object.freeze({
    id: 'breakthrough',
    label: 'Ruptura',
    detail: 'Consigue que una pieza blanca cruce la franja de ruinas y termine en la sexta fila o más allá.',
  }),
  bridgehead: Object.freeze({
    id: 'hold',
    label: 'Mantener la cabeza de puente',
    detail: 'Sobrevive 12 plies desde el despliegue inicial sin recibir mate.',
    targetPlies: 12,
  }),
});

function humanPieceBeyondLine(chess, color) {
  for (const rank of chess.board()) {
    for (const piece of rank) {
      if (!piece || piece.color !== color || piece.type === 'k') continue;
      const squareRank = Number(piece.square?.[1] || 0);
      if (color === 'w' ? squareRank >= 6 : squareRank <= 3) return true;
    }
  }
  return false;
}

export function arenaObjectiveForPreset(presetId) {
  return OBJECTIVES[presetId] || null;
}

export function arenaObjectiveState(presetId, fen, { elapsedPlies = 0, humanColor = 'w' } = {}) {
  const objective = arenaObjectiveForPreset(presetId);
  if (!objective) return null;
  try {
    const chess = new Chess(fen);
    const terminal = chess.isCheckmate();
    if (objective.id === 'breakthrough') {
      const achieved = humanPieceBeyondLine(chess, humanColor);
      return { ...objective, achieved, failed: terminal && !achieved, progress: achieved ? 1 : 0, target: 1 };
    }
    if (objective.id === 'hold') {
      const target = Number(objective.targetPlies || 12);
      const progress = Math.min(target, Math.max(0, Number(elapsedPlies || 0)));
      const achieved = progress >= target && !terminal;
      return { ...objective, achieved, failed: terminal && !achieved, progress, target };
    }
    return null;
  } catch {
    return null;
  }
}
