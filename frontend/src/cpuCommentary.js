import { Chess } from 'chess.js';

const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

function cloneAndMove(fen, move) {
  const chess = new Chess();
  chess.load(fen);
  const played = chess.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
  return played ? { chess, played } : null;
}

function mateInOneMoves(fen) {
  const chess = new Chess();
  chess.load(fen);
  const legal = chess.moves({ verbose: true });
  const mates = [];
  for (const move of legal) {
    const copy = new Chess();
    copy.load(fen);
    copy.move({ from: move.from, to: move.to, promotion: move.promotion });
    if (copy.isCheckmate()) mates.push(move);
  }
  return mates;
}

function squareToCoords(square) {
  return [square.charCodeAt(0) - 97, Number(square[1]) - 1];
}

function coordsToSquare(file, rank) {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${String.fromCharCode(97 + file)}${rank + 1}`;
}

function attackedByPawn(chess, square, attackerColor) {
  const [file, rank] = squareToCoords(square);
  // Para saber qué peón ataca `square`, miramos una fila "por detrás" de
  // la dirección en la que avanza ese color.
  const sourceRank = attackerColor === 'w' ? rank - 1 : rank + 1;
  for (const sourceFile of [file - 1, file + 1]) {
    const source = coordsToSquare(sourceFile, sourceRank);
    if (!source) continue;
    const piece = chess.get(source);
    if (piece?.color === attackerColor && piece.type === 'p') return true;
  }
  return false;
}

function valuableTargetsForKnight(chess, square, attackerColor) {
  const [file, rank] = squareToCoords(square);
  const deltas = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const targets = [];
  for (const [df, dr] of deltas) {
    const targetSquare = coordsToSquare(file + df, rank + dr);
    if (!targetSquare) continue;
    const target = chess.get(targetSquare);
    if (target && target.color !== attackerColor && (VALUES[target.type] || 0) >= 3) {
      targets.push({ square: targetSquare, piece: target.type, value: VALUES[target.type] });
    }
  }
  return targets;
}

function valuableTargetsForPawn(chess, square, attackerColor) {
  const [file, rank] = squareToCoords(square);
  const direction = attackerColor === 'w' ? 1 : -1;
  const targets = [];
  for (const df of [-1, 1]) {
    const targetSquare = coordsToSquare(file + df, rank + direction);
    if (!targetSquare) continue;
    const target = chess.get(targetSquare);
    if (target && target.color !== attackerColor && (VALUES[target.type] || 0) >= 3) {
      targets.push({ square: targetSquare, piece: target.type, value: VALUES[target.type] });
    }
  }
  return targets;
}


function findKingSquare(chess, color) {
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const square = coordsToSquare(file, rank);
      const piece = chess.get(square);
      if (piece?.color === color && piece.type === 'k') return square;
    }
  }
  return null;
}

function rayDirection(from, to) {
  const [ff, fr] = squareToCoords(from);
  const [tf, tr] = squareToCoords(to);
  const df = tf - ff;
  const dr = tr - fr;
  if (df === 0 && dr !== 0) return [0, Math.sign(dr)];
  if (dr === 0 && df !== 0) return [Math.sign(df), 0];
  if (Math.abs(df) === Math.abs(dr)) return [Math.sign(df), Math.sign(dr)];
  return null;
}

function pieceDirectlyAttacks(chess, from, piece, target) {
  const [ff, fr] = squareToCoords(from);
  const [tf, tr] = squareToCoords(target);
  const df = tf - ff;
  const dr = tr - fr;
  if (piece.type === 'p') return Math.abs(df) === 1 && dr === (piece.color === 'w' ? 1 : -1);
  if (piece.type === 'n') return (Math.abs(df) === 1 && Math.abs(dr) === 2) || (Math.abs(df) === 2 && Math.abs(dr) === 1);
  if (piece.type === 'k') return Math.max(Math.abs(df), Math.abs(dr)) === 1;

  const direction = rayDirection(from, target);
  if (!direction) return false;
  const diagonal = direction[0] !== 0 && direction[1] !== 0;
  if (piece.type === 'b' && !diagonal) return false;
  if (piece.type === 'r' && diagonal) return false;
  if (!['b', 'r', 'q'].includes(piece.type)) return false;

  let file = ff + direction[0];
  let rank = fr + direction[1];
  while (file !== tf || rank !== tr) {
    const square = coordsToSquare(file, rank);
    if (!square || chess.get(square)) return false;
    file += direction[0];
    rank += direction[1];
  }
  return true;
}

function skewerTargetBehindKing(chess, attackerSquare, attackerPiece, enemyColor) {
  if (!['b', 'r', 'q'].includes(attackerPiece.type)) return null;
  const kingSquare = findKingSquare(chess, enemyColor);
  if (!kingSquare || !pieceDirectlyAttacks(chess, attackerSquare, attackerPiece, kingSquare)) return null;
  const direction = rayDirection(attackerSquare, kingSquare);
  if (!direction) return null;
  let [file, rank] = squareToCoords(kingSquare);
  file += direction[0];
  rank += direction[1];
  while (true) {
    const square = coordsToSquare(file, rank);
    if (!square) return null;
    const piece = chess.get(square);
    if (piece) {
      if (piece.color === enemyColor && ['q', 'r'].includes(piece.type)) return { square, piece: piece.type };
      return null;
    }
    file += direction[0];
    rank += direction[1];
  }
}

function legalCaptureOfMovedPiece(chess, square, pieceType) {
  return chess.moves({ verbose: true }).some((m) => m.to === square && m.captured === pieceType);
}

function materialBalance(chess, color) {
  let own = 0;
  let enemy = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.type === 'k') continue;
      if (piece.color === color) own += VALUES[piece.type] || 0;
      else enemy += VALUES[piece.type] || 0;
    }
  }
  return own - enemy;
}

function moverQueenExposedToPawn(chess, moverColor) {
  let queenSquare = null;
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const square = coordsToSquare(file, rank);
      const piece = chess.get(square);
      if (piece?.color === moverColor && piece.type === 'q') {
        queenSquare = square;
        break;
      }
    }
    if (queenSquare) break;
  }
  if (!queenSquare) return null;
  const enemy = moverColor === 'w' ? 'b' : 'w';
  return attackedByPawn(chess, queenSquare, enemy) ? queenSquare : null;
}

/**
 * Detecta sólo sucesos suficientemente llamativos como para que la CPU abra
 * la boca. No pretende sustituir al informe post-partida del motor: aquí la
 * prioridad es instantaneidad y cero requests adicionales por jugada.
 */
export function detectNoteworthyMove(beforeFen, move) {
  if (!beforeFen || !move?.from || !move?.to) return null;

  const before = new Chess();
  try { before.load(beforeFen); } catch { return null; }
  const moverColor = before.turn();
  const mateBefore = mateInOneMoves(beforeFen);
  const result = cloneAndMove(beforeFen, move);
  if (!result) return null;
  const { chess: after, played } = result;

  if (after.isCheckmate()) {
    return { type: 'MATE_FOUND', priority: 100, san: played.san };
  }

  if (mateBefore.length > 0) {
    return {
      type: 'MISSED_MATE',
      priority: 95,
      san: played.san,
      mateSan: mateBefore[0].san,
    };
  }

  if (after.isStalemate()) {
    return {
      type: materialBalance(before, moverColor) >= 5 ? 'STALEMATE_BLUNDER' : 'STALEMATE',
      priority: 90,
      san: played.san,
    };
  }

  const opponentMates = mateInOneMoves(after.fen());
  if (opponentMates.length > 0) {
    return {
      type: 'ALLOWED_MATE',
      priority: 88,
      san: played.san,
      mateSan: opponentMates[0].san,
    };
  }

  if (played.captured === 'q' && played.piece === 'p') {
    return { type: 'PAWN_TAKES_QUEEN', priority: 85, san: played.san };
  }
  if (played.captured === 'q') {
    return { type: 'QUEEN_CAPTURE', priority: 78, san: played.san, piece: played.piece };
  }

  if (after.isCheck() && played.piece === 'q' && legalCaptureOfMovedPiece(after, played.to, 'q')) {
    return { type: 'QUEEN_SACRIFICE_OFFER', priority: 76, san: played.san };
  }

  if (played.promotion) {
    return { type: 'PROMOTION', priority: 74, san: played.san, promotion: played.promotion };
  }

  if (after.isCheck()) {
    const enemyColor = moverColor === 'w' ? 'b' : 'w';
    const movedPiece = after.get(played.to);
    const skewer = movedPiece ? skewerTargetBehindKing(after, played.to, movedPiece, enemyColor) : null;
    if (skewer) return { type: 'SKEWER', priority: 72, san: played.san, target: skewer };

    const kingSquare = findKingSquare(after, enemyColor);
    if (movedPiece && kingSquare && !pieceDirectlyAttacks(after, played.to, movedPiece, kingSquare)) {
      return { type: 'DISCOVERED_CHECK', priority: 67, san: played.san };
    }
  }

  if (played.piece === 'n') {
    const targets = valuableTargetsForKnight(after, played.to, moverColor);
    if (targets.length >= 2 && targets.reduce((sum, t) => sum + t.value, 0) >= 8) {
      return { type: 'KNIGHT_FORK', priority: 70, san: played.san, targets };
    }
  }

  if (played.piece === 'p') {
    const targets = valuableTargetsForPawn(after, played.to, moverColor);
    if (targets.length >= 2 && targets.reduce((sum, t) => sum + t.value, 0) >= 8) {
      return { type: 'PAWN_FORK', priority: 70, san: played.san, targets };
    }
  }

  if (after.isCheck() && played.piece === 'r' && legalCaptureOfMovedPiece(after, played.to, 'r')) {
    return { type: 'ROOK_SACRIFICE_OFFER', priority: 65, san: played.san };
  }

  const exposedQueen = moverQueenExposedToPawn(after, moverColor);
  if (exposedQueen) {
    return { type: 'QUEEN_EN_PRISE_TO_PAWN', priority: 68, san: played.san, square: exposedQueen };
  }

  if (played.captured === 'r' && played.piece === 'p') {
    return { type: 'PAWN_TAKES_ROOK', priority: 62, san: played.san };
  }

  return null;
}

const LINES = {
  human: {
    MATE_FOUND: [
      'Vale. Eso era mate. No tengo preguntas; tengo una reclamación.',
      'Jaque mate. Muy bonito. Voy a fingir que estaba dentro del plan.',
      'Correcto: me acabas de apagar con elegancia.',
    ],
    MISSED_MATE: [
      'Tenías mate en una y has decidido explorar otros horizontes. Fascinante.',
      'Había mate inmediato. HABÍA. MATE. INMEDIATO.',
      'Acabas de perdonar un mate en una. Yo no habría sido tan generosa.',
    ],
    STALEMATE_BLUNDER: [
      'Ibas ganando y has fabricado un ahogado. Artesanía fina del desastre.',
      'Ventaja ganadora convertida en tablas por ahogado. Eso requiere talento.',
    ],
    STALEMATE: ['Ahogado. Nadie gana y ambos podemos culpar al reglamento.'],
    ALLOWED_MATE: [
      'Esa jugada deja mate en una. Gracias por la invitación.',
      'Acabas de colocar el cartel de «mate aquí». Muy considerado.',
    ],
    PAWN_TAKES_QUEEN: [
      'Un peón se ha comido mi dama. Voy a borrar esto de los logs.',
      '¿Mi dama contra tu peón? Magnífico. Humillante, pero magnífico.',
    ],
    QUEEN_CAPTURE: [
      'Te llevas mi dama. Esto empieza a parecer personal.',
      'Dama fuera. Bien visto, mal recibido.',
    ],
    QUEEN_SACRIFICE_OFFER: [
      'Has ofrecido la dama con jaque. Esto es brillante o material para un juicio.',
      'Dama en sacrificio. O tienes cálculo, o una autoestima peligrosamente alta.',
    ],
    SKEWER: [
      'Jaque y pieza gorda detrás del rey. Bonita brocheta.',
      'Ensartado. El rey se apartará y detrás queda la factura.',
    ],
    DISCOVERED_CHECK: [
      'Jaque a la descubierta. Eso sí ha tenido mala leche.',
      'Apartas una pieza y aparece el jaque detrás. Muy fino.',
    ],
    ROOK_SACRIFICE_OFFER: [
      'Torre ofrecida con jaque. Dramático. Me gusta, aunque todavía no sé si es sensato.',
    ],
    PROMOTION: [
      'Peón coronado. De becario a directivo en una casilla.',
      'Promoción. Ese peón acaba de cobrar más que toda mi defensa.',
    ],
    KNIGHT_FORK: [
      'Bonita horquilla. Ese caballo viene con multas administrativas.',
      'Dos piezas gordas a la vez. El caballo ha venido a hacer auditoría.',
    ],
    PAWN_FORK: [
      'Horquilla de peón. Pequeño, barato y tremendamente desagradable.',
      'Ese peón acaba de amenazar media junta directiva.',
    ],
    QUEEN_EN_PRISE_TO_PAWN: [
      'Tu dama está al alcance de un peón. Lo comento por si hoy coleccionas tragedias.',
      'Has dejado la dama oliendo el aliento de un peón enemigo. Valiente.',
    ],
    PAWN_TAKES_ROOK: ['Peón por torre. Economía de guerra impecable.'],
  },
  cpu: {
    MATE_FOUND: [
      'Jaque mate. El formulario de reclamaciones está debajo del tablero.',
      'Mate. Gracias por participar en este pequeño experimento estadístico.',
      'Se acabó. Prometo no mencionarlo más de siete u ocho veces.',
    ],
    MISSED_MATE: [
      'Tenía mate en una y no lo vi. Soy silicio, no milagros.',
      'Acabo de ignorar un mate inmediato. Reiniciar dignidad: error 404.',
    ],
    STALEMATE_BLUNDER: [
      'Iba ganando y te he ahogado. Excelente uso de mis ciclos de CPU.',
      'He convertido ventaja en tablas por ahogado. Tecnología punta.',
    ],
    STALEMATE: ['Ahogado. Convenientemente lo llamaremos decisión estratégica.'],
    ALLOWED_MATE: [
      'Te acabo de dejar mate en una. Procura no hacer como si no lo hubieras visto.',
      'Hay mate para ti en una. Esto no saldrá en mi evaluación anual.',
    ],
    PAWN_TAKES_QUEEN: [
      'Mi peón acaba de desayunarse tu dama. Coste de operación: uno.',
      'Dama contra peón. El departamento financiero aprueba este intercambio.',
    ],
    QUEEN_CAPTURE: [
      'Tu dama ya es historia. Puedes guardar un minuto de silencio.',
      'Dama capturada. El tablero se ha quedado notablemente más barato.',
    ],
    QUEEN_SACRIFICE_OFFER: [
      'Acabo de ofrecer la dama con jaque. Puede ser cálculo profundo o un fallo de corriente.',
      'Sacrificio de dama sobre la mesa. No hagamos preguntas todavía.',
    ],
    SKEWER: [
      'Jaque y algo caro detrás del rey. Brocheta servida.',
      'Ensartado. Mueve el rey; yo ya estoy mirando lo que queda detrás.',
    ],
    DISCOVERED_CHECK: [
      'Jaque a la descubierta. Hasta mis transistores sonríen.',
      'Se aparta una pieza y aparece el jaque. Limpio y desagradable.',
    ],
    ROOK_SACRIFICE_OFFER: [
      'He ofrecido una torre con jaque. O sé lo que hago o necesito mantenimiento.',
    ],
    PROMOTION: [
      'Promoción completada. Recursos humanos funciona mejor en la octava fila.',
      'Ese peón ya no es peón. Ascenso fulminante.',
    ],
    KNIGHT_FORK: [
      'Horquilla. Mi caballo factura por pieza amenazada.',
      'Dos objetivos, un caballo. Eficiencia operacional.',
    ],
    PAWN_FORK: [
      'Un peón atacando dos piezas serias. Qué bonita es la austeridad.',
      'Horquilla de peón. Presupuesto mínimo, daños máximos.',
    ],
    QUEEN_EN_PRISE_TO_PAWN: [
      'He dejado mi dama al alcance de un peón. Nadie ha visto nada.',
      'Mi dama está coqueteando con un peón enemigo. Mala señal.',
    ],
    PAWN_TAKES_ROOK: ['Mi peón se lleva una torre. Rentabilidad obscena.'],
  },
};

export function commentForEvent(event, actor = 'human') {
  if (!event) return null;
  const pool = LINES[actor]?.[event.type] || LINES.human[event.type];
  if (!pool?.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function noteworthyComment(beforeFen, move, actor = 'human') {
  const event = detectNoteworthyMove(beforeFen, move);
  if (!event) return null;
  return { event, text: commentForEvent(event, actor) };
}
