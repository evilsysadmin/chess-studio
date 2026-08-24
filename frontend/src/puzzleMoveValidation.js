import { Chess } from 'chess.js';

function normalizeSan(san) {
  return String(san || '').trim().replace(/[+#]+$/g, '').replace(/[!?]+$/g, '');
}

// Los puzzles almacenan la línea canónica en SAN. Comparar la SAN como texto
// exacto es demasiado frágil: un motor/import antiguo puede guardar "Nc7" y
// chess.js devolver "Nc7+" para exactamente el mismo movimiento. Primero
// toleramos sólo sufijos de anotación/jaque; si no basta, resolvemos la SAN
// esperada sobre el FEN y comparamos identidad de jugada.
export function matchesExpectedPuzzleMove(fen, expectedSan, actualMove) {
  if (!fen || !expectedSan || !actualMove?.from || !actualMove?.to) return false;
  if (normalizeSan(expectedSan) === normalizeSan(actualMove.san)) return true;
  try {
    const expectedBoard = new Chess(fen);
    const expectedMove = expectedBoard.move(expectedSan);
    if (!expectedMove) return false;
    return expectedMove.from === actualMove.from
      && expectedMove.to === actualMove.to
      && (expectedMove.promotion || null) === (actualMove.promotion || null);
  } catch {
    return false;
  }
}
