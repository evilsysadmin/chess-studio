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
      'Jaque mate. Perfecto. Has encontrado la salida de emergencia y, contra todo pronóstico, sabías abrir la puerta.',
      'Mate. Limpio, preciso y bastante ofensivo para mi autoestima de silicio.',
      'Se acabó. Esa ha sido buena. No te acostumbres a verme admitirlo.',
      'Jaque mate. Has pasado de sospechoso habitual a delincuente táctico con expediente.',
      'Mate ejecutado. Cierro la boca porque cualquier sarcasmo ahora mismo sería puro despecho.',
    ],
    MISSED_MATE: [
      'Tenías mate en una. EN UNA. Y has decidido donar la victoria a la ciencia.',
      'Había jaque mate inmediato y has pasado de largo como quien ve su salida en la autopista y acelera.',
      'Mate en una ignorado. Esto no es ajedrez creativo; es abandono de funciones.',
      'Acabas de perdonar un mate en una. Ni la Cruz Roja reparte tanta misericordia.',
      'Tenías al rey rival listo para el entierro y has pedido que le devuelvan las constantes vitales. Magnífico.',
      'La posición gritaba «MATE» y tú has contestado «ahora no, gracias». Una gestión impecable del desastre.',
    ],
    STALEMATE_BLUNDER: [
      'Ibas ganando y has fabricado un ahogado. Convertir oro en serrín también es una habilidad.',
      'Ventaja ganadora convertida en tablas. Has rescatado a tu rival del incendio y luego le has dado las llaves de casa.',
      'Ahogado con ventaja. Técnicamente son tablas; espiritualmente es una declaración de quiebra.',
      'Tenías la partida en el bolsillo y acabas de coser el bolsillo por dentro. Artesanía del desastre.',
      'Eso era ganado. Ahora son tablas. Hay cirujanos que hacen menos daño con una motosierra.',
    ],
    STALEMATE: [
      'Ahogado. Nadie gana, pero alguien debería sentirse bastante incómodo con cómo hemos llegado hasta aquí.',
      'Tablas por ahogado. El reglamento acaba de entrar para separar la pelea.',
    ],
    ALLOWED_MATE: [
      'Esa jugada deja mate en una. Gracias por envolverlo para regalo.',
      'Acabas de poner un cartel luminoso que dice «MATE AQUÍ». Hasta yo puedo seguir instrucciones.',
      'Me has dejado mate en una con la delicadeza de quien aparca un camión dentro del salón.',
      'Regalar mate en una es una forma muy eficiente de reducir el tiempo de partida. Te lo concedo.',
      'Tu rey acaba de presentar la dimisión y tú le has firmado el formulario.',
      'Tengo mate en una. Si no lo hago, puedes apagarme tú mismo por dignidad.',
    ],
    PAWN_TAKES_QUEEN: [
      'Un peón se ha comido mi dama. Una pieza que cuesta uno acaba de atracar a la aristocracia. Me quito el sombrero.',
      'Peón por dama. Eso no es una captura: es una expropiación con violencia administrativa.',
      'Tu peón acaba de llevarse mi dama. Nueve puntos abatidos por un funcionario de infantería. Precioso y repugnante.',
      'Mi dama ha muerto a manos de un peón. Borra la partida, quema el servidor y no hablemos de esto jamás.',
      'Un peón contra mi dama. Y ganó el peón. Hay derrotas y luego está este informe forense.',
    ],
    QUEEN_CAPTURE: [
      'Te llevas mi dama. Disfruta del momento; no pienso facilitarte otro recuerdo tan bonito.',
      'Dama fuera. Buena captura. Acabas de encarecer seriamente mi factura de venganza.',
      'Mi dama acaba de desaparecer del tablero. Espero que estés orgulloso; yo estoy tomando nombres.',
      'Nueve puntos al bolsillo. Eso sí ha dolido donde guardo los transistores sensibles.',
    ],
    QUEEN_SACRIFICE_OFFER: [
      'Has puesto la dama en el altar con jaque. O has calculado una barbaridad o acabas de cometer un delito con mucha puesta en escena.',
      'Sacrificio de dama. Esto puede acabar en una obra maestra o en una autopsia. Continúa.',
      'Dama ofrecida con jaque. Mucha capa, mucho humo. Ahora falta comprobar si debajo hay magia o una avería.',
      'Eso tiene aspecto de sacrificio brillante. También lo tienen algunas catástrofes justo antes del impacto.',
    ],
    SKEWER: [
      'Jaque y pieza cara detrás. Bonita brocheta: primero apartas al rey y luego pasas la factura.',
      'Ensartado. El rey huye y detrás queda alguien pagando sus deudas. Muy fino.',
      'Has puesto al rey delante de la caja fuerte. Elegante, cruel y perfectamente legal.',
      'Brocheta táctica. Esto ya no es mover piezas; es cobrar peaje.',
    ],
    DISCOVERED_CHECK: [
      'Jaque a la descubierta. Has apartado una cortina y detrás había una escopeta táctica. Bonito.',
      'Se mueve una pieza y aparece el jaque. Eso sí tiene clase: violencia con mecanismo de relojería.',
      'Jaque descubierto. Limpio, desagradable y con ese perfume de «lo tenía calculado».',
    ],
    ROOK_SACRIFICE_OFFER: [
      'Torre ofrecida con jaque. Cinco puntos ardiendo en la mesa. Espero que hayas traído una buena explicación.',
      'Sacrificio de torre. Valiente. Ahora veremos si eres Tal o simplemente alguien con problemas de inventario.',
      'Has lanzado una torre por la ventana con jaque. Puede ser arte. Puede ser una denuncia al seguro.',
    ],
    PROMOTION: [
      'Peón coronado. De carne de cañón a consejo de administración en una sola casilla.',
      'Promoción. Ese peón acaba de ascender más rápido que un sobrino del director.',
      'Llegó como peón y salió con despacho, coche oficial y poderes de dama. Nada mal.',
      'Coronación completada. El becario ahora manda y todos fingimos que era el plan.',
    ],
    KNIGHT_FORK: [
      'Horquilla de caballo. Dos piezas gordas mirando al mismo verdugo con forma de L.',
      'Ese caballo acaba de abrir dos expedientes disciplinarios a la vez. Eficiencia obscena.',
      'Dos objetivos, un caballo y cero paciencia. Bonita extorsión geométrica.',
      'Horquilla. El caballo ha entrado en la sala y de pronto nadie encuentra una salida digna.',
    ],
    PAWN_FORK: [
      'Horquilla de peón. Una unidad de presupuesto amenazando media junta directiva. Capitalismo táctico perfecto.',
      'Ese peón cuesta uno y acaba de poner a dos piezas caras a redactar testamento.',
      'Peón atacando dos piezas serias. Barato, vulgar y tremendamente eficaz. Me encanta odiarlo.',
      'Horquilla de peón. Presupuesto de mercadillo, daños de auditoría fiscal.',
    ],
    QUEEN_EN_PRISE_TO_PAWN: [
      'Tu dama está al alcance de un peón. Nueve puntos aparcados delante de una excavadora de uno. Planazo.',
      'Has dejado la dama a tiro de peón. No es valentía; es poner un Ferrari delante de una trituradora y dejar las llaves puestas.',
      'Ese peón puede comerse tu dama. Te lo digo porque aparentemente alguien tiene que ejercer de adulto aquí.',
      'Tu dama está oliendo el aliento de un peón enemigo. Si sobrevive será por misericordia, no por planificación.',
      'Dama en prise por peón. Hay formas más discretas de pedir una derrota, pero ninguna tan eficiente.',
    ],
    PAWN_TAKES_ROOK: [
      'Peón por torre. Uno contra cinco. Eso no es rentabilidad: es saqueo con contabilidad creativa.',
      'Tu peón acaba de desmontar una torre. La austeridad, bien aplicada, es terrorífica.',
      'Una torre menos por el módico precio de un peón. Oferta válida hasta fin de existencias.',
    ],
  },
  cpu: {
    MATE_FOUND: [
      'Jaque mate. No ha sido personal; sólo matemáticamente inevitable y estéticamente satisfactorio.',
      'Mate. Puedes revisar la partida buscando el momento exacto en que empezó el funeral.',
      'Se acabó. Tu rey ya no necesita estrategia; necesita servicios funerarios.',
      'Jaque mate. He cerrado la posición como un notario: sello, firma y fuera.',
      'Mate ejecutado. La buena noticia es que ya no puedes empeorar esta partida.',
      'Jaque mate. Gracias por traer un rey a esta demostración práctica de vulnerabilidad.',
    ],
    MISSED_MATE: [
      'Tenía mate en una y no lo vi. Acabo de convertir silicio de alta tecnología en una tostadora cara.',
      'He ignorado un mate inmediato. Si alguien pregunta, esto era una prueba de humildad.',
      'Mate en una delante de mis narices y he elegido otra cosa. Excelente argumento contra la automatización.',
      'Acabo de perdonar un mate en una. Mis desarrolladores sienten una perturbación en la fuerza.',
      'Eso era mate. Yo no lo vi. Procedo a mirarme fijamente en un log hasta recuperar la dignidad.',
    ],
    STALEMATE_BLUNDER: [
      'Iba ganando y te he ahogado. He usado millones de operaciones por segundo para fabricar unas tablas. Tecnología punta.',
      'Ventaja ganadora convertida en ahogado. Soy una supercomputadora emocionalmente equivalente a pisar un rastrillo.',
      'Te tenía muerto y he decidido darte tablas. Filantropía digital de la peor especie.',
      'Acabo de transformar una victoria en media victoria para nadie. Eficiencia inversa impecable.',
      'Ahogado. Tenía el cadáver preparado y he conseguido que se levante y firme unas tablas.',
    ],
    STALEMATE: [
      'Ahogado. Convenientemente lo llamaremos decisión estratégica y destruiremos las pruebas.',
      'Tablas por ahogado. Ninguno gana; mi departamento de propaganda ya está redactando otra versión.',
    ],
    ALLOWED_MATE: [
      'Te acabo de dejar mate en una. Si lo fallas, esta partida debería quedar clasificada por razones humanitarias.',
      'Hay mate en una para ti. Te he puesto incluso la alfombra roja; intenta no tropezar con ella.',
      'Acabo de regalarte mate. Si no lo ves, tendremos que compartir la vergüenza y me niego.',
      'Tu siguiente jugada puede apagarme. No hagas que tenga que explicártelo con pictogramas.',
      'He dejado mi rey con una única cita pendiente: el funeral. Adelante.',
    ],
    PAWN_TAKES_QUEEN: [
      'Mi peón acaba de comerse tu dama. Uno contra nueve. Esto no es ajedrez: es una OPA hostil.',
      'Dama abatida por peón. Tu aristocracia acaba de ser nacionalizada por la infantería.',
      'Tu dama valía nueve. Mi peón, uno. Gracias por patrocinar este máster gratuito de economía aplicada.',
      'Un peón acaba de llevarse tu dama. Hay humillaciones que deberían venir con música de ascensor.',
      'Peón mata dama. Ni siquiera voy a presumir demasiado; la posición ya se está riendo por mí.',
      'Tu dama acaba de perder una pelea contra alguien que sólo sabe caminar hacia delante. Procesa eso con calma.',
    ],
    QUEEN_CAPTURE: [
      'Tu dama ya es historia. Nueve puntos menos y, de propina, una pequeña crisis institucional.',
      'Dama capturada. La pieza más poderosa del tablero acaba de solicitar la baja definitiva.',
      'Me llevo tu dama. Puedes continuar, por supuesto. También puedes continuar una cena después de que arda la cocina.',
      'Nueve puntos fuera. La partida sigue viva en el mismo sentido en que un barco sin proa sigue flotando unos segundos.',
      'Tu dama ha salido del tablero. El resto de tus piezas acaba de actualizar el currículum.',
    ],
    QUEEN_SACRIFICE_OFFER: [
      'He puesto la dama en sacrificio con jaque. Si funciona, soy un genio. Si no, borra este comentario.',
      'Dama al fuego. Esto tiene cálculo profundo o un cortocircuito espectacular. En breve lo sabremos.',
      'Sacrificio de dama. Mucho teatro, sí; pero a veces el teatro termina con alguien sin rey.',
      'Acabo de ofrecer nueve puntos con una sonrisa. O sé exactamente lo que hago o necesito garantía.',
    ],
    SKEWER: [
      'Jaque y una pieza cara detrás. Mueve el rey; yo ya he reservado mesa para el segundo plato.',
      'Ensartado. Primero corre el monarca, luego cobro la factura. Protocolo impecable.',
      'Tu rey está haciendo de guardaespaldas de una pieza que pienso robar. Admirable sacrificio laboral.',
      'Brocheta servida. El rey sale primero y detrás viene el postre.',
    ],
    DISCOVERED_CHECK: [
      'Jaque a la descubierta. Una pieza se aparta y aparece el problema real. Como una inspección fiscal.',
      'Se abre la cortina y detrás estaba el jaque. Limpio, puntual y bastante desagradable.',
      'Jaque descubierto. Me gusta cuando la violencia táctica viene con mecanismo oculto.',
      'Aparto una pieza y aparece el cañón. No todo tiene que ser sutil, pero ayuda.',
    ],
    ROOK_SACRIFICE_OFFER: [
      'He lanzado una torre con jaque. Cinco puntos en llamas. Espero que al menos iluminen el camino al mate.',
      'Sacrificio de torre. Si esto sale mal, oficialmente fue una actualización defectuosa.',
      'Torre al matadero con jaque. Drama premium; ahora comprobemos si había guion.',
    ],
    PROMOTION: [
      'Promoción completada. Mi peón ha entrado de becario y acaba de comprar la empresa.',
      'Coronación. Ese peón ya tiene más autoridad que buena parte de tu ejército.',
      'De peón a dama en una casilla. Ascenso indecente, totalmente reglamentario.',
      'Promoción. Recursos humanos acaba de perder completamente el control del organigrama.',
    ],
    KNIGHT_FORK: [
      'Horquilla. Mi caballo amenaza dos piezas y ninguna ha traído abogado.',
      'Dos objetivos, un caballo. La geometría puede ser una forma de extorsión.',
      'Mi caballo acaba de repartir citaciones judiciales a dos piezas a la vez.',
      'Horquilla de caballo. Elegante forma de preguntar cuál de tus piezas prefieres perder.',
    ],
    PAWN_FORK: [
      'Un peón está atacando dos piezas caras. Presupuesto mínimo, ruina máxima. Mi modelo de negocio favorito.',
      'Horquilla de peón. Una ficha de un punto acaba de convertir tu posición en un mercadillo de saldos.',
      'Dos piezas importantes acosadas por un peón. La aristocracia vuelve a tener problemas con el proletariado.',
      'Mi peón cuesta uno y acaba de poner dos activos premium contra las cuerdas. Eficiencia obscena.',
    ],
    QUEEN_EN_PRISE_TO_PAWN: [
      'He dejado mi dama al alcance de un peón. Magnífico. Una IA avanzada reproduciendo errores de bar a las tres de la mañana.',
      'Mi dama está a tiro de peón. Si la pierdo, reinicia el contenedor y fingimos que nunca existí.',
      'He aparcado nueve puntos delante de una pieza de uno. Finanzas acaba de bloquear mi tarjeta corporativa.',
      'Mi dama puede morir contra un peón. En términos técnicos, esto se denomina «hacer el imbécil con precisión binaria».',
    ],
    PAWN_TAKES_ROOK: [
      'Mi peón se lleva una torre. Uno por cinco. Si esto fuera bolsa, vendrían a investigarme.',
      'Peón por torre. Acabo de comprar un edificio con monedas del sofá.',
      'Una torre menos por un peón. Rentabilidad tan obscena que debería llevar comisión.',
    ],
  },
};

const EVENT_FACTS = {
  MATE_FOUND: ['has aparecido con jaque mate', 'he encontrado jaque mate'],
  MISSED_MATE: ['tenías mate en una y lo has ignorado', 'tenía mate en una y lo he ignorado'],
  STALEMATE_BLUNDER: ['has convertido una posición ganadora en ahogado', 'he convertido una posición ganadora en ahogado'],
  STALEMATE: ['has cerrado la partida por ahogado', 'he cerrado la partida por ahogado'],
  ALLOWED_MATE: ['has dejado mate en una', 'he dejado mate en una'],
  PAWN_TAKES_QUEEN: ['tu peón se ha comido mi dama', 'mi peón se ha comido tu dama'],
  QUEEN_CAPTURE: ['te has llevado mi dama', 'me he llevado tu dama'],
  QUEEN_SACRIFICE_OFFER: ['has ofrecido la dama con jaque', 'he ofrecido la dama con jaque'],
  SKEWER: ['has montado un ensartado', 'he montado un ensartado'],
  DISCOVERED_CHECK: ['has encontrado un jaque a la descubierta', 'he encontrado un jaque a la descubierta'],
  ROOK_SACRIFICE_OFFER: ['has ofrecido una torre con jaque', 'he ofrecido una torre con jaque'],
  PROMOTION: ['has coronado un peón', 'he coronado un peón'],
  KNIGHT_FORK: ['has clavado una horquilla de caballo', 'he clavado una horquilla de caballo'],
  PAWN_FORK: ['has clavado una horquilla de peón', 'he clavado una horquilla de peón'],
  QUEEN_EN_PRISE_TO_PAWN: ['has dejado la dama al alcance de un peón', 'he dejado mi dama al alcance de un peón'],
  PAWN_TAKES_ROOK: ['tu peón se ha llevado mi torre', 'mi peón se ha llevado tu torre'],
};

function factFor(event, actor) {
  const pair = EVENT_FACTS[event.type] || ['has hecho algo tácticamente notable', 'he hecho algo tácticamente notable'];
  return pair[actor === 'cpu' ? 1 : 0];
}

function gentlemanComment(event, actor) {
  const fact = factFor(event, actor);
  const praise = ['MATE_FOUND', 'PAWN_TAKES_QUEEN', 'QUEEN_CAPTURE', 'SKEWER', 'DISCOVERED_CHECK', 'PROMOTION', 'KNIGHT_FORK', 'PAWN_FORK', 'PAWN_TAKES_ROOK'].includes(event.type);
  if (actor === 'human' && praise) return `Debo concedértelo: ${fact}. Una jugada muy digna.`;
  if (actor === 'human') return `Con todo respeto: ${fact}. Quizá convenga revisar ese momento con calma.`;
  if (praise) return `Me permitirás una pequeña satisfacción: ${fact}. Continuemos.`;
  return `Debo admitir una imprecisión: ${fact}. Nada honorable en ocultarlo.`;
}

function masterComment(event, actor) {
  const fact = factFor(event, actor);
  const catastrophic = ['MISSED_MATE', 'STALEMATE_BLUNDER', 'ALLOWED_MATE', 'QUEEN_EN_PRISE_TO_PAWN'].includes(event.type);
  if (actor === 'human' && catastrophic) return `En mi club, ${fact} y el reloj se paraba por vergüenza. Apúntalo y no lo repitas.`;
  if (actor === 'human') return `Ajá: ${fact}. Al menos hoy alguien ha venido a estudiar.`;
  if (catastrophic) return `Magnífico: ${fact}. Décadas de teoría para terminar haciendo esto. No digas que fui yo.`;
  return `Esto sí lo enseñábamos antes de que todo el mundo quisiera resolverlo con una app: ${fact}.`;
}

function halComment(event, actor) {
  const fact = factFor(event, actor);
  const catastrophic = ['MISSED_MATE', 'STALEMATE_BLUNDER', 'ALLOWED_MATE', 'QUEEN_EN_PRISE_TO_PAWN'].includes(event.type);
  if (actor === 'human' && catastrophic) return `Anomalía crítica detectada: ${fact}. Probabilidad de que esto fuese intencionado: despreciable.`;
  if (actor === 'human') return `Patrón táctico registrado: ${fact}. Actualizando mi estimación sobre ti.`;
  if (catastrophic) return `Error interno de criterio: ${fact}. Recomiendo no usar esta secuencia como material promocional.`;
  return `Secuencia óptima interesante: ${fact}. Satisfacción computacional dentro de parámetros.`;
}

function casterComment(event, actor) {
  const fact = factFor(event, actor);
  const catastrophic = ['MISSED_MATE', 'STALEMATE_BLUNDER', 'ALLOWED_MATE', 'QUEEN_EN_PRISE_TO_PAWN'].includes(event.type);
  if (actor === 'human' && catastrophic) return `¡ATENCIÓN AL TABLERO! ${fact}. El público no sabe si mirar la posición o llamar a emergencias.`;
  if (actor === 'human') return `¡Y ahí está! ${fact}. Jugada de repetición instantánea.`;
  if (catastrophic) return `¡Giro dramático! ${fact}. La cabina pide revisar la cinta porque esto cuesta creerlo en directo.`;
  return `¡Señoras y señores! ${fact}. La partida acaba de subir dos marchas.`;
}

export function commentForEvent(event, actor = 'human', personality = 'bco') {
  if (!event) return null;
  if (personality === 'gentleman') return gentlemanComment(event, actor);
  if (personality === 'master') return masterComment(event, actor);
  if (personality === 'hal') return halComment(event, actor);
  if (personality === 'caster') return casterComment(event, actor);
  const pool = LINES[actor]?.[event.type] || LINES.human[event.type];
  if (!pool?.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function noteworthyComment(beforeFen, move, actor = 'human', personality = 'bco') {
  const event = detectNoteworthyMove(beforeFen, move);
  if (!event) return null;
  return { event, text: commentForEvent(event, actor, personality) };
}
