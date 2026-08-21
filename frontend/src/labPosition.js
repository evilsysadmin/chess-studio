import { Chess } from 'chess.js';

export const LAB_START_FEN = new Chess().fen();

const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];
const PIECES = /[prnbqkPRNBQK]/;

export function mapFromPlacement(fenOrPlacement) {
  const out = {};
  const part = String(fenOrPlacement || '').trim().split(/\s+/)[0];
  const rows = part.split('/');
  if (rows.length !== 8) return null;
  for (let r = 0; r < 8; r += 1) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/[1-8]/.test(ch)) f += Number(ch);
      else {
        if (!PIECES.test(ch) || f > 7) return null;
        out[FILES[f] + RANKS[r]] = ch;
        f += 1;
      }
    }
    if (f !== 8) return null;
  }
  return out;
}

export function placementFromMap(map) {
  return RANKS.map((rank) => {
    let out = '';
    let empty = 0;
    for (const file of FILES) {
      const value = map[file + rank] || '';
      if (!value) { empty += 1; continue; }
      if (empty) { out += empty; empty = 0; }
      out += value;
    }
    if (empty) out += empty;
    return out;
  }).join('/');
}

function countPieces(map, color) {
  return Object.values(map).filter((piece) => (color === 'w' ? /[A-Z]/ : /[a-z]/).test(piece));
}

function squareDistance(a, b) {
  const file = (sq) => FILES.indexOf(sq[0]);
  const rank = (sq) => Number(sq[1]);
  return Math.max(Math.abs(file(a) - file(b)), Math.abs(rank(a) - rank(b)));
}

function minimumPromotionsRequired(map, color) {
  const isOwn = (piece) => (color === 'w' ? /[A-Z]/ : /[a-z]/).test(piece);
  const entries = Object.entries(map).filter(([, piece]) => isOwn(piece));
  const typeCount = (type) => entries.filter(([, piece]) => piece.toLowerCase() === type).length;

  // Q/R/N solo necesitan promoción cuando exceden el material inicial.
  let required = Math.max(0, typeCount('q') - 1)
    + Math.max(0, typeCount('r') - 2)
    + Math.max(0, typeCount('n') - 2);

  // Cada alfil original está ligado para siempre a un color de casilla. Dos
  // alfiles vivos sobre casillas del mismo color implican al menos una promoción,
  // aunque el total de alfiles siga siendo solamente dos.
  const bishopSquares = entries
    .filter(([, piece]) => piece.toLowerCase() === 'b')
    .map(([square]) => square);
  const parityCounts = [0, 0];
  for (const square of bishopSquares) {
    const parity = (FILES.indexOf(square[0]) + Number(square[1])) % 2;
    parityCounts[parity] += 1;
  }
  required += Math.max(0, parityCounts[0] - 1) + Math.max(0, parityCounts[1] - 1);
  return required;
}

function castlingErrors(map, castling) {
  const errors = [];
  const rights = castling === '-' ? '' : castling;
  if (rights.includes('K') && !(map.e1 === 'K' && map.h1 === 'R')) errors.push('El enroque blanco corto exige rey en e1 y torre en h1.');
  if (rights.includes('Q') && !(map.e1 === 'K' && map.a1 === 'R')) errors.push('El enroque blanco largo exige rey en e1 y torre en a1.');
  if (rights.includes('k') && !(map.e8 === 'k' && map.h8 === 'r')) errors.push('El enroque negro corto exige rey en e8 y torre en h8.');
  if (rights.includes('q') && !(map.e8 === 'k' && map.a8 === 'r')) errors.push('El enroque negro largo exige rey en e8 y torre en a8.');
  return errors;
}

function enPassantErrors(map, turn, ep) {
  if (!ep || ep === '-') return [];
  if (!/^[a-h][36]$/.test(ep)) return ['La casilla en-passant sólo puede estar en la fila 3 o 6.'];
  const file = ep[0];
  const rank = Number(ep[1]);
  // Si mueven blancas, el último movimiento tuvo que ser ...p7-p5 y el peón
  // negro queda en la fila 5. Si mueven negras, el peón blanco queda en 4.
  const pawnSq = turn === 'w' ? `${file}5` : `${file}4`;
  const expectedPawn = turn === 'w' ? 'p' : 'P';
  if ((turn === 'w' && rank !== 6) || (turn === 'b' && rank !== 3)) {
    return ['La casilla en-passant no es compatible con el bando al turno.'];
  }
  if (map[pawnSq] !== expectedPawn) return ['El FEN declara en-passant pero no existe el peón que acaba de avanzar dos casillas.'];
  return [];
}

export function validateLabPosition(raw, fallbackTurn = 'w') {
  const errors = [];
  let parsed;
  try {
    parsed = parseLabPosition(raw, fallbackTurn);
  } catch (error) {
    return { valid: false, errors: [error?.message || 'FEN inválido'], parsed: null };
  }

  const { map, turn, castling, ep, fen } = parsed;
  const whitePieces = countPieces(map, 'w');
  const blackPieces = countPieces(map, 'b');
  const whiteKings = whitePieces.filter((p) => p === 'K').length;
  const blackKings = blackPieces.filter((p) => p === 'k').length;
  if (whiteKings !== 1) errors.push('Debe haber exactamente un rey blanco.');
  if (blackKings !== 1) errors.push('Debe haber exactamente un rey negro.');
  if (whitePieces.length > 16 || blackPieces.length > 16) errors.push('Un bando no puede tener más de 16 piezas.');
  const whitePawns = whitePieces.filter((p) => p === 'P').length;
  const blackPawns = blackPieces.filter((p) => p === 'p').length;
  if (whitePawns > 8 || blackPawns > 8) errors.push('Un bando no puede tener más de 8 peones.');

  // Presupuesto mínimo de promociones: una pieza extra tuvo que salir de un
  // peón que ya no existe como peón. Caza FEN materialmente imposibles como
  // ocho peones + dos damas, y también dos alfiles en el mismo color de casilla
  // sin haber perdido al menos un peón para promocionarlo.
  if (minimumPromotionsRequired(map, 'w') > 8 - whitePawns) errors.push('El material blanco exige más promociones que peones disponibles.');
  if (minimumPromotionsRequired(map, 'b') > 8 - blackPawns) errors.push('El material negro exige más promociones que peones disponibles.');
  for (const file of FILES) {
    if (map[`${file}1`] === 'P' || map[`${file}8`] === 'P' || map[`${file}1`] === 'p' || map[`${file}8`] === 'p') {
      errors.push('No puede haber peones en la primera u octava fila.');
      break;
    }
  }
  errors.push(...castlingErrors(map, castling));
  errors.push(...enPassantErrors(map, turn, ep));

  if (whiteKings === 1 && blackKings === 1) {
    const whiteKingSquare = Object.entries(map).find(([, piece]) => piece === 'K')?.[0];
    const blackKingSquare = Object.entries(map).find(([, piece]) => piece === 'k')?.[0];
    if (whiteKingSquare && blackKingSquare && squareDistance(whiteKingSquare, blackKingSquare) <= 1) {
      errors.push('Los dos reyes no pueden estar en casillas adyacentes.');
    }
  }

  // chess.js acepta algunos FEN sintácticamente válidos que no pueden venir
  // de una partida legal. El rey del bando que NO mueve no puede estar ya en
  // jaque: eso implicaría que el turno anterior terminó dejando a su propio
  // rey atacado o que el rival dio jaque y cedió el turno sin responder.
  if (whiteKings === 1 && blackKings === 1) {
    try {
      const fields = fen.split(/\s+/);
      fields[1] = turn === 'w' ? 'b' : 'w';
      fields[2] = '-';
      fields[3] = '-';
      const otherTurn = new Chess(fields.join(' '));
      if (otherTurn.isCheck()) errors.push('El rey del bando que no mueve ya está en jaque: posición imposible.');
    } catch {
      errors.push('La posición no supera la validación legal del tablero.');
    }
  }

  return { valid: errors.length === 0, errors, parsed };
}

export function assertLegalLabPosition(raw, fallbackTurn = 'w') {
  const result = validateLabPosition(raw, fallbackTurn);
  if (!result.valid) throw new Error(result.errors[0]);
  return result.parsed;
}

export function parseLabPosition(raw, fallbackTurn = 'w') {
  const value = String(raw || '').trim();
  const map = mapFromPlacement(value);
  if (!map) throw new Error('FEN/colocación inválida');
  const fields = value.split(/\s+/);

  if (fields.length >= 6) {
    if (fields.length !== 6) throw new Error('Un FEN completo debe tener exactamente 6 campos.');
    const chess = new Chess(value);
    const normalized = chess.fen();
    const normalizedFields = normalized.split(/\s+/);
    return {
      map,
      turn: normalizedFields[1],
      castling: normalizedFields[2],
      ep: normalizedFields[3],
      halfmove: normalizedFields[4],
      fullmove: normalizedFields[5],
      fen: normalized,
    };
  }

  if (fields.length !== 1) throw new Error('Pega un FEN completo de 6 campos o sólo la colocación de piezas.');
  const turn = fallbackTurn === 'b' ? 'b' : 'w';
  const fen = `${placementFromMap(map)} ${turn} - - 0 1`;
  new Chess(fen);
  return { map, turn, castling: '-', ep: '-', halfmove: '0', fullmove: '1', fen };
}

export function fenFromLabState({ map, turn, castling = '-', ep = '-', halfmove = '0', fullmove = '1' }) {
  return `${placementFromMap(map)} ${turn === 'b' ? 'b' : 'w'} ${castling || '-'} ${ep || '-'} ${halfmove || '0'} ${fullmove || '1'}`;
}
