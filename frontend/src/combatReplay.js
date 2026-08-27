import { Chess } from 'chess.js';
import { chessFromFen } from './chessRules.js';

export const DEFAULT_COMBAT_START_FEN = new Chess().fen();

/**
 * Construye las posiciones visibles de un replay de Combat sin confiar en
 * históricos antiguos/corruptos. Conserva un slot por entrada del log para
 * que índices, análisis y botones sigan alineados; una posición dañada se
 * sustituye por la última válida y queda marcada para avisar al usuario.
 */
export function buildCombatReplayPositions(log = []) {
  const rows = Array.isArray(log) ? log : [];
  const first = chessFromFen(rows[0]?.fenBefore);
  let current = first?.fen() || DEFAULT_COMBAT_START_FEN;
  const positions = [current];
  const invalidIndices = [];

  rows.forEach((entry, index) => {
    const parsed = chessFromFen(entry?.fenAfter);
    if (parsed) current = parsed.fen();
    else invalidIndices.push(index);
    positions.push(current);
  });

  return { positions, invalidIndices, initialFen: positions[0] };
}
