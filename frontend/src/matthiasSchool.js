import { Chess } from 'chess.js';
import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

export const MATTHIAS_SCHOOL_KEY = 'chess-study-matthias-school-v1';

export const MATTHIAS_SCHOOL_REFERENCES = Object.freeze({
  'capablanca-fundamentals': Object.freeze({
    label: 'José Raúl Capablanca · Chess Fundamentals',
    kind: 'public-domain',
    note: 'Principios y técnica de finales reautorizados como microlecciones interactivas.',
  }),
  'lasker-strategy': Object.freeze({
    label: 'Edward Lasker · Chess Strategy',
    kind: 'public-domain',
    note: 'Movilidad, desarrollo, estructura y toma de decisiones reautorizados para la Class Room.',
  }),
  'practice-taxonomy': Object.freeze({
    label: 'Taxonomía pública de práctica táctica',
    kind: 'open-reference',
    note: 'Nombres de motivos usados sólo como clasificación; posiciones y textos son propios de Chess Studio.',
  }),
});

export const MATTHIAS_SCHOOL_COURSES = Object.freeze([
  { id: 'basic', label: 'Básico', shortLabel: 'Básico', rank: 1, description: 'Cómo se mueven las piezas, capturas, rey seguro y mate elemental.' },
  { id: 'basic-medium', label: 'Básico-medio', shortLabel: 'Básico-medio', rank: 2, description: 'Desarrollo, centro, tempos y primeras secuencias de varias jugadas.' },
  { id: 'medium', label: 'Medio', shortLabel: 'Medio', rank: 3, description: 'Patrones tácticos, promoción y coordinación para rematar.' },
  { id: 'medium-advanced', label: 'Medio-avanzado', shortLabel: 'Medio-avanzado', rank: 4, description: 'Cálculo de líneas forzadas, redes de mate y coordinación multipieza.' },
  { id: 'advanced', label: 'Avanzado', shortLabel: 'Avanzado', rank: 5, description: 'Sacrificios justificados, desviación y cálculo preciso sin red de seguridad.' },
  { id: 'strategy', label: 'Estrategia', shortLabel: 'Estrategia', rank: 6, description: 'Planes: actividad, casillas fuertes, columnas abiertas, rupturas, simplificación y profilaxis.' },
  { id: 'endgames', label: 'Finales', shortLabel: 'Finales', rank: 7, description: 'Oposición, casillas clave, peones pasados y técnica de torre: Lucena para ganar y Philidor para resistir.' },
]);

const human = (from, to, note = null) => ({ from, to, auto: false, note });
const reply = (from, to) => ({ from, to, auto: true });

export const MATTHIAS_SCHOOL_LESSONS = Object.freeze([
  // ── BÁSICO ──────────────────────────────────────────────────────────────
  {
    id: 'pawn-double-step', courseId: 'basic', eyebrow: 'Básico · 1', title: 'El peón avanza', piece: 'peón',
    fen: '7k/8/8/8/8/8/4P3/K7 w - - 0 1', line: [human('e2', 'e4')],
    objective: 'Lleva el peón blanco de e2 a e4.',
    explanation: 'Desde su casilla inicial un peón puede avanzar una o dos casillas si el camino está libre. Después, normalmente sólo una.',
    hint: 'Selecciona e2 y busca el salto de dos casillas hacia e4. Hacia delante, no en diagonal: todavía no estamos capturando nada.',
    success: 'Bien. Dos casillas y ningún tratado internacional roto. El peón avanza de frente.',
  },
  {
    id: 'pawn-capture', courseId: 'basic', eyebrow: 'Básico · 2', title: 'El peón captura distinto', piece: 'peón',
    fen: '7k/8/8/8/8/5n2/4P3/K7 w - - 0 1', line: [human('e2', 'f3')],
    objective: 'Captura el caballo negro de f3 con el peón de e2.',
    explanation: 'El peón avanza de frente, pero captura una casilla en diagonal. Sí, alguien decidió que esto era intuitivo.',
    hint: 'Desde e2, el caballo está exactamente una diagonal hacia delante: f3.',
    success: 'Correcto. El peón no captura de frente: muerde en diagonal. Ya puedes aterrorizar damas mal aparcadas.',
  },
  {
    id: 'rook-lines', courseId: 'basic', eyebrow: 'Básico · 3', title: 'La torre va por raíles', piece: 'torre',
    fen: '7k/3p4/8/8/3R4/8/8/K7 w - - 0 1', line: [human('d4', 'd7')],
    objective: 'Captura el peón de d7 con la torre de d4.',
    explanation: 'La torre se desplaza tantas casillas como quiera en horizontal o vertical. No gira en mitad del viaje y no salta piezas.',
    hint: 'd4 y d7 comparten columna. Sube por la columna d hasta el peón.',
    success: 'Exacto. Línea recta, captura, fin. La torre aprecia la burocracia simple.',
  },
  {
    id: 'bishop-diagonal', courseId: 'basic', eyebrow: 'Básico · 4', title: 'El alfil vive en diagonal', piece: 'alfil',
    fen: 'k7/8/1n6/8/3B4/8/8/7K w - - 0 1', line: [human('d4', 'b6')],
    objective: 'Captura el caballo de b6 con el alfil de d4.',
    explanation: 'El alfil se mueve sólo en diagonal y nunca cambia de color de casilla. Cada alfil está condenado a media geografía del tablero.',
    hint: 'Desde d4, sube dos diagonales hacia la izquierda: c5, b6.',
    success: 'Bien. Diagonal limpia. El alfil seguirá en casillas del mismo color hasta el fin de los tiempos.',
  },
  {
    id: 'knight-jump', courseId: 'basic', eyebrow: 'Básico · 5', title: 'El caballo ignora el tráfico', piece: 'caballo',
    fen: 'k7/8/8/5p2/3N4/8/8/7K w - - 0 1', line: [human('d4', 'f5')],
    objective: 'Captura el peón de f5 con el caballo de d4.',
    explanation: 'El caballo hace una L: dos casillas en una dirección y una perpendicular. Además salta por encima de cualquier pieza.',
    hint: 'De d4 a f5 hay dos columnas y una fila. Esa L es exactamente territorio de caballo.',
    success: 'Eso es. Una L absurda y perfectamente legal. Por eso los caballos fabrican horquillas con tanta mala baba.',
  },
  {
    id: 'queen-power', courseId: 'basic', eyebrow: 'Básico · 6', title: 'La dama hace casi de todo', piece: 'dama',
    fen: '1k6/3p4/8/3Q4/8/8/8/1K6 w - - 0 1', line: [human('d5', 'd7')],
    objective: 'Captura el peón de d7 con la dama de d5.',
    explanation: 'La dama combina torre y alfil: rectas y diagonales, tantas casillas como tenga libres. Poderosa, sí; inmortal, no.',
    hint: 'La dama y el peón comparten la columna d. Dos casillas hacia arriba.',
    success: 'Correcto. Mucha potencia. Ahora recuerda la parte difícil: no regalarla a un peón.',
  },
  {
    id: 'king-step', courseId: 'basic', eyebrow: 'Básico · 7', title: 'El rey camina, no corre', piece: 'rey',
    fen: '7k/8/8/8/3K4/8/8/8 w - - 0 1', line: [human('d4', 'e4')],
    objective: 'Mueve el rey blanco de d4 a e4.',
    explanation: 'El rey mueve una casilla en cualquier dirección y jamás puede entrar en una casilla atacada.',
    hint: 'e4 está justo al lado de d4. Una sola casilla horizontal.',
    success: 'Bien. Una casilla. El rey no tiene prisa; tiene súbditos para eso.',
  },
  {
    id: 'castle-short', courseId: 'basic', eyebrow: 'Básico · 8', title: 'Enroque corto', piece: 'rey',
    fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1', line: [human('e1', 'g1')],
    objective: 'Enrócate corto: haz clic en el rey de e1 y después en g1. No muevas la torre: se recoloca sola.',
    explanation: 'En el enroque se mueven rey y torre en una sola jugada. Hace falta que no se hayan movido, que el camino esté libre y que el rey no atraviese jaque.',
    hint: 'Haz clic en el rey de e1 y luego en g1. El movimiento es del rey; Chess Studio llevará automáticamente la torre de h1 a f1.',
    success: 'Correcto. Rey a cubierto, torre activada. Por una vez dos piezas han hecho su trabajo a la vez.',
  },
  {
    id: 'mate-one', courseId: 'basic', eyebrow: 'Básico · EXAMEN', title: 'Examen básico · mate en una', piece: 'dama', exam: true, maxMistakes: 2,
    fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', line: [human('f7', 'g7')],
    objective: 'Sin pista: encuentra el mate en una y aprueba el curso Básico.',
    explanation: 'No basta con dar jaque: el rey rival debe quedarse sin captura, bloqueo ni casilla de escape.',
    success: 'Aprobado. Ya sabes mover las piezas y terminar una partida. El siguiente curso ya puede hacerte daño de formas más interesantes.',
  },

  // ── BÁSICO-MEDIO ───────────────────────────────────────────────────────
  {
    id: 'opening-development', courseId: 'basic-medium', eyebrow: 'Básico-medio · 1', title: 'Desarrolla con propósito', piece: 'pieza',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    line: [human('e2', 'e4'), reply('e7', 'e5'), human('g1', 'f3'), reply('b8', 'c6'), human('f1', 'b5')],
    objective: 'Juega e4, desarrolla el caballo a f3 y después el alfil a b5. Yo moveré las negras entre medias.',
    explanation: 'Una apertura sana ocupa el centro y desarrolla piezas con cada tempo. Mover la misma pieza sin necesidad suele regalar tiempo.',
    hint: 'Empieza por e2-e4. Después caballo g1-f3. Finalmente el alfil de f1 encuentra la diagonal hacia b5.',
    success: 'Bien. Tres jugadas, tres tareas útiles. Casi parece que hay un plan.',
  },
  {
    id: 'center-with-tempo', courseId: 'basic-medium', eyebrow: 'Básico-medio · 2', title: 'Gana un tempo desarrollando', piece: 'pieza',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    line: [human('e2', 'e4'), reply('d7', 'd5'), human('e4', 'd5'), reply('d8', 'd5'), human('b1', 'c3')],
    objective: 'Ocupa el centro, acepta el cambio y desarrolla el caballo atacando la dama rival.',
    explanation: 'Desarrollar una pieza con amenaza gana un tempo: mejoras tu ejército y obligas al rival a responder.',
    hint: 'e4, exd5 y, cuando la dama negra recapture en d5, Nc3 la obliga a volver a moverse.',
    success: 'Exacto. Has desarrollado con amenaza. El rival gasta tiempo; tú no. Matemáticas bastante agradables.',
  },
  {
    id: 'ruy-castle-sequence', courseId: 'basic-medium', eyebrow: 'Básico-medio · 3', title: 'Desarrolla y pon al rey a cubierto', piece: 'pieza',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    line: [human('f1', 'b5'), reply('a7', 'a6'), human('b5', 'a4'), reply('g8', 'f6'), human('e1', 'g1')],
    objective: 'Desarrolla el alfil, conserva la pieza cuando la ataquen y termina enrocando.',
    explanation: 'Desarrollo y seguridad del rey suelen ir juntos. El enroque no es decoración: conecta el plan de apertura con el medio juego.',
    hint: 'Alfil f1-b5, retíralo a a4 tras ...a6 y, después de ...Nf6, haz clic en el rey e1 y en g1. La torre se moverá sola.',
    success: 'Correcto. Has desarrollado, reaccionado a una amenaza y terminado con el rey seguro. Ya empieza a parecer ajedrez.',
  },
  {
    id: 'fork-course-exam', courseId: 'basic-medium', eyebrow: 'Básico-medio · EXAMEN', title: 'Examen básico-medio · horquilla completa', piece: 'caballo', exam: true, maxMistakes: 2,
    fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', line: [human('b5', 'c7'), reply('e8', 'd8'), human('c7', 'a8')],
    objective: 'Sin pistas: fuerza el rey con una horquilla y cobra la torre.',
    explanation: 'Una horquilla eficaz no es sólo atacar dos piezas: el jaque obliga a responder y te garantiza el segundo golpe.',
    success: 'Aprobado. Jaque, respuesta forzada, material cobrado. Ya no sólo mueves piezas: empiezas a encadenar consecuencias.',
  },

  // ── MEDIO ───────────────────────────────────────────────────────────────
  {
    id: 'backrank-pattern', courseId: 'medium', eyebrow: 'Medio · 1', title: 'Reconoce el pasillo', piece: 'torre',
    fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', line: [human('a1', 'a8')],
    objective: 'Detecta el rey encerrado por sus propios peones y remata.',
    explanation: 'El mate de pasillo aparece cuando el rey no tiene aire. Antes de calcular diez jugadas, mira si una torre puede entrar en la última fila.',
    hint: 'La columna a está libre y la octava fila no ofrece escapatoria al rey negro.',
    success: 'Mate de pasillo. A veces el rival construye su propia cárcel y sólo hay que cerrar la puerta.',
  },
  {
    id: 'create-pin', courseId: 'medium', eyebrow: 'Medio · 2', title: 'Clava una pieza y aprieta', piece: 'alfil',
    fen: '4k3/p7/2n5/8/2B5/8/8/4K3 w - - 0 1', line: [human('c4', 'b5'), reply('a7', 'a6'), human('b5', 'c6')],
    objective: 'Clava el caballo contra el rey; cuando te ataque el peón, cobra la pieza con jaque.',
    explanation: 'Una pieza clavada puede tener movimientos legales geométricamente, pero moverla dejaría al rey en jaque. Esa restricción permite aumentar la presión.',
    hint: 'Bb5 inmoviliza el caballo de c6 contra el rey de e8. Tras ...a6, Bxc6+ convierte la clavada en material.',
    success: 'Bien. Primero restringes, luego cobras. Mucho más elegante que correr detrás de piezas al azar.',
  },
  {
    id: 'promotion-capture', courseId: 'medium', eyebrow: 'Medio · 3', title: 'Promociona con violencia administrativa', piece: 'peón',
    fen: '4k2r/6P1/8/8/8/8/8/4K3 w - - 0 1', line: [human('g7', 'h8')],
    objective: 'Captura la torre de h8 y promociona el peón.',
    explanation: 'Un peón que alcanza la última fila puede convertirse en dama, torre, alfil o caballo. Si además captura material, el cambio de valor es brutal.',
    hint: 'g7 puede capturar h8. Chess Studio promociona a dama por defecto en esta lección.',
    success: 'Peón convertido en dama y torre rival retirada del servicio. Ascenso por méritos extraordinariamente claros.',
  },
  {
    id: 'mate-two-edge', courseId: 'medium', eyebrow: 'Medio · 4', title: 'Empuja al rey hacia el remate', piece: 'pieza',
    fen: '8/7k/7p/5p2/5p2/1Q6/RK6/3N4 w - - 0 1', line: [human('b3', 'f7'), reply('h7', 'h8'), human('a2', 'a8')],
    objective: 'Calcula dos jugadas tuyas: primero obliga al rey a h8 y después remata con la torre.',
    explanation: 'El primer jaque no siempre mata; a veces sólo coloca al rey exactamente donde la segunda pieza lo necesita.',
    hint: 'Qf7+ fuerza ...Kh8. Entonces la torre de a2 tiene la octava fila preparada.',
    success: 'Correcto. El primer jaque empuja; el segundo cierra. Coordinación, no fuegos artificiales.',
  },
  {
    id: 'medium-exam', courseId: 'medium', eyebrow: 'Medio · EXAMEN', title: 'Examen medio · caja cerrada', piece: 'pieza', exam: true, maxMistakes: 1,
    fen: '1k6/4N3/3K4/8/1p6/2Q1p3/2p4R/8 w - - 0 1', line: [human('c3', 'c7'), reply('b8', 'a8'), human('h2', 'h8')],
    objective: 'Sin pistas: encuentra el jaque que encierra al rey y termina la red de mate.',
    explanation: 'Dama y torre controlan funciones distintas: una fuerza la casilla; la otra ejecuta el mate.',
    success: 'Aprobado. Ya calculas una respuesta forzada antes de mover. Eso separa bastante al jugador del turista.',
  },

  // ── MEDIO-AVANZADO ─────────────────────────────────────────────────────
  {
    id: 'rook-ladder', courseId: 'medium-advanced', eyebrow: 'Medio-avanzado · 1', title: 'Dos torres, una red', piece: 'torre',
    fen: '8/k7/5R2/7R/1p1p4/6p1/8/B5K1 w - - 0 1', line: [human('h5', 'h7'), reply('a7', 'a8'), human('f6', 'f8')],
    objective: 'Usa una torre para empujar al rey y la otra para cerrar la última fila.',
    explanation: 'Las torres coordinadas funcionan mejor cuando una corta una fila y la otra entra por la siguiente. No hace falta que ambas den jaque a la vez.',
    hint: 'Rh7+ fuerza ...Ka8. Después Rf8# cierra el corredor.',
    success: 'Dos torres, dos tareas, cero escapatorias. Ya estás coordinando piezas en lugar de enviarlas de excursión.',
  },
  {
    id: 'silent-mate-net', courseId: 'medium-advanced', eyebrow: 'Medio-avanzado · 2', title: 'La jugada fuerte no da jaque', piece: 'torre',
    fen: '1B6/4RN1k/K3p3/8/2p5/8/3R4/8 w - - 0 1', line: [human('d2', 'g2'), reply('c4', 'c3'), human('e7', 'e8'), reply('e6', 'e5'), human('e8', 'h8')],
    objective: 'Construye la red completa. La primera jugada es silenciosa: calcula cinco medias jugadas.',
    explanation: 'Buscar sólo jaques es una forma estupenda de perder combinaciones. Una jugada tranquila puede quitar escapatorias y preparar una secuencia forzada.',
    hint: 'Empieza con Rg2. Tras ...c3, la otra torre entra en e8; después de ...e5, Rh8 termina.',
    success: 'Muy bien. Has empezado sin jaque y aun así controlabas el final de la secuencia. Eso ya requiere cálculo de verdad.',
  },
  {
    id: 'king-joins-attack', courseId: 'medium-advanced', eyebrow: 'Medio-avanzado · 3', title: 'El rey también es una pieza', piece: 'pieza',
    fen: '8/k7/3K4/3p4/p3R3/8/B4R2/5N2 w - - 0 1', line: [human('e4', 'a4'), reply('a7', 'b8'), human('d6', 'c6'), reply('d5', 'd4'), human('f2', 'f8')],
    objective: 'Calcula la línea completa: jaque con torre, mejora el rey y termina con la segunda torre.',
    explanation: 'En posiciones reducidas el rey deja de ser equipaje frágil y se convierte en una pieza activa que controla casillas críticas.',
    hint: 'Rxa4+ fuerza ...Kb8. Luego Kc6 prepara la red; tras ...d4, Rf8#.',
    success: 'Correcto. Incluso el rey ha trabajado. Una jornada histórica para la administración pública del tablero.',
  },
  {
    id: 'medium-advanced-exam', courseId: 'medium-advanced', eyebrow: 'Medio-avanzado · EXAMEN', title: 'Examen medio-avanzado · red multipieza', piece: 'pieza', exam: true, maxMistakes: 1,
    fen: 'k7/6B1/8/Kp5p/1p2N1R1/Q6p/8/8 w - - 0 1', line: [human('a5', 'b6'), reply('a8', 'b8'), human('a3', 'a6'), reply('h3', 'h2'), human('g7', 'e5')],
    objective: 'Sin pistas: coordina rey, dama y alfil durante cinco medias jugadas y encuentra el mate.',
    explanation: 'Cuando varias piezas controlan funciones distintas, el cálculo debe seguir la red completa y no una sola amenaza.',
    success: 'Aprobado. Has coordinado tres piezas y anticipado dos respuestas. Ya puedes entrar en Avanzado sin que llame a un adulto.',
  },

  // ── AVANZADO ────────────────────────────────────────────────────────────
  {
    id: 'opera-finale', courseId: 'advanced', eyebrow: 'Avanzado · 1', title: 'Final de la Ópera · sacrifica con fundamento', piece: 'pieza',
    fen: '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w - - 0 16', line: [human('b3', 'b8'), reply('d7', 'b8'), human('d1', 'd8')],
    objective: 'Sacrifica la dama con jaque para desviar al caballo y termina con mate de torre.',
    explanation: 'Qb8+ obliga al caballo de d7 a capturar. Eso despeja d8 para la torre; el rey no puede tomarla porque el alfil de g5 protege d8.',
    hint: 'Qb8+ Nxb8 y entonces Rd8#. El sacrificio no es romanticismo: la continuación demuestra el mate.',
    success: 'Exacto. Has entregado la dama porque el mate estaba calculado, no porque te sintieras artístico. Diferencia importante.',
  },
  {
    id: 'deflection-sacrifice', courseId: 'advanced', eyebrow: 'Avanzado · 2', title: 'Desvía al rey antes del golpe final', piece: 'pieza',
    fen: '5rk1/4Q1pp/8/3NN3/8/8/8/R5K1 w - - 0 1', line: [human('e7', 'f8'), reply('g8', 'f8'), human('a1', 'a8')],
    objective: 'Entrega la dama para arrastrar al rey a f8 y remata con la torre en la octava.',
    explanation: 'La dama elimina la torre de f8 y obliga al rey a ocupar esa casilla. Los caballos controlan e7 y f7; la torre entra entonces sin escapatoria.',
    hint: 'Qxf8+ obliga Kxf8. Después Ra8# aprovecha que e7 y f7 están controladas y g7 está ocupado por el propio ejército negro.',
    success: 'Bien. El sacrificio cambia la geometría del rey y la torre aprovecha el nuevo mapa. Eso es desviación, no beneficencia.',
  },
  {
    id: 'advanced-exam', courseId: 'advanced', eyebrow: 'Avanzado · EXAMEN FINAL', title: 'Examen avanzado · el rey entra en servicio', piece: 'pieza', exam: true, maxMistakes: 0,
    fen: '8/7k/4K3/4p3/3R3p/8/2R4B/2N5 w - - 0 1', line: [human('d4', 'h4'), reply('h7', 'g8'), human('e6', 'f6'), reply('e5', 'e4'), human('c2', 'c8')],
    objective: 'Sin pistas y sin margen de error: reconoce el patrón en una posición reflejada, calcula cinco medias jugadas y termina con mate.',
    explanation: 'La geometría está reflejada respecto a una lección anterior. Si entendiste la coordinación en lugar de memorizar casillas, la solución sigue siendo visible.',
    success: 'Aprobado. Curso Avanzado completado. Puedes seguir cometiendo errores, por supuesto; ahora serán errores con formación reglada.',
  },
  // ── ESTRATEGIA ──────────────────────────────────────────────────────────
  {
    id: 'open-file-tempo', courseId: 'strategy', eyebrow: 'Estrategia · 1', title: 'Ocupa la columna con tempo', piece: 'torre',
    discipline: 'strategy', concept: 'open-file', referenceId: 'lasker-strategy',
    fen: '6k1/4q3/8/8/8/8/8/R5K1 w - - 0 1', line: [human('a1', 'e1')],
    objective: 'Lleva la torre a la columna e y gana actividad atacando la dama negra.',
    explanation: 'Una columna abierta vale más cuando la torre entra con una amenaza concreta. Re1 mejora la pieza y obliga a la dama a reaccionar.',
    hint: 'Busca una casilla de la primera fila desde la que la torre vea directamente e7.',
    success: 'Re1. Actividad con tempo: una mejora propia y un problema ajeno en la misma jugada. Ajedrez con economía administrativa.',
  },
  {
    id: 'knight-outpost', courseId: 'strategy', eyebrow: 'Estrategia · 2', title: 'Instala un caballo en un puesto fuerte', piece: 'caballo',
    discipline: 'strategy', concept: 'outpost', referenceId: 'lasker-strategy',
    fen: '6k1/pp3ppp/8/8/8/2N5/PP3PPP/6K1 w - - 0 1', line: [human('c3', 'd5')],
    objective: 'Centraliza el caballo en d5, una casilla que los peones negros no pueden expulsar.',
    explanation: 'Un puesto fuerte combina actividad y estabilidad. En d5 el caballo mejora su radio de acción y no existe un peón negro en c6 o e6 capaz de echarlo.',
    hint: 'Desde c3, busca la casilla central d5.',
    success: 'Nd5. Un caballo central que no puede ser pateado por peones deja de ser caballo y empieza a cobrar alquiler.',
  },
  {
    id: 'space-fix-pawn', courseId: 'strategy', eyebrow: 'Estrategia · 3', title: 'Gana espacio y fija una debilidad', piece: 'peón',
    discipline: 'strategy', concept: 'space', referenceId: 'lasker-strategy',
    fen: '6k1/8/3p4/8/2P5/8/8/6K1 w - - 0 1', line: [human('c4', 'c5')],
    objective: 'Avanza c4-c5 para ganar espacio y fijar el peón de d6 como objetivo.',
    explanation: 'El avance c5 restringe casillas y deja el peón d6 menos móvil. La estrategia empieza muchas veces cambiando la geometría antes de atacar nada.',
    hint: 'Empuja el peón de c4 una casilla.',
    success: 'c5. No has capturado nada y, sin embargo, el tablero negro es un poco más pequeño. Esa es la gracia.',
  },
  {
    id: 'queen-trade-ahead', courseId: 'strategy', eyebrow: 'Estrategia · 4', title: 'Simplifica cuando te conviene', piece: 'dama',
    discipline: 'strategy', concept: 'simplification', referenceId: 'capablanca-fundamentals',
    fen: '3qk3/8/8/8/8/8/3Q4/R3K3 w - - 0 1', line: [human('d2', 'd8'), reply('e8', 'd8')],
    objective: 'Cambia damas con Qxd8+ y entra en un final donde tu torre extra pesa mucho más.',
    explanation: 'Cuando tienes ventaja material, reducir contrajuego suele aumentar el valor práctico de esa ventaja. El cambio de damas elimina la pieza más peligrosa del rival.',
    hint: 'Las damas comparten la columna d y no hay piezas entre ellas.',
    success: 'Cambio de damas completado. Menos fuegos artificiales, más torre extra. Capablanca habría aprobado la contabilidad.',
  },
  {
    id: 'create-luft', courseId: 'strategy', eyebrow: 'Estrategia · 5', title: 'Hazle una puerta al rey', piece: 'peón',
    discipline: 'strategy', concept: 'prophylaxis', referenceId: 'lasker-strategy',
    fen: '6k1/8/8/8/8/8/5PPP/4R1K1 w - - 0 1', line: [human('h2', 'h3')],
    objective: 'Juega h3 para crear una casilla de escape y reducir futuros mates de pasillo.',
    explanation: 'La profilaxis resuelve problemas antes de que sean amenazas concretas. Un pequeño luft en h2-h3 puede cambiar por completo la seguridad de la primera fila.',
    hint: 'Mueve el peón h una casilla: no buscas atacar, buscas aire.',
    success: 'h3. Una jugada pequeña que evita una muerte muy estúpida. La prevención también puntúa.',
  },
  {
    id: 'zwischenzug-before-recapture', courseId: 'strategy', eyebrow: 'Estrategia · laboratorio', title: 'Zwischenzug · jaque antes de recapturar', piece: 'pieza',
    discipline: 'calculation', concept: 'zwischenzug', referenceId: 'practice-taxonomy',
    fen: '6k1/5ppp/8/8/2Bq4/8/8/3Q3K w - - 0 1',
    line: [human('c4', 'f7'), reply('g8', 'f7'), human('d1', 'd4')],
    objective: 'No recaptures la dama todavía: inserta Bxf7+, obliga al rey a tomar y sólo entonces juega Qxd4.',
    explanation: 'El zwischenzug cambia el orden natural de la secuencia. La recaptura puede esperar si una amenaza forzada mejora primero la posición o elimina una defensa.',
    hint: 'Antes de Qxd4, el alfil de c4 tiene un jaque en f7 que obliga al rey negro a reaccionar.',
    success: 'Bxf7+ primero y Qxd4 después. Mismo material recuperado, pero con el rey rival desplazado. El orden de las operaciones también juega al ajedrez.',
  },
  {
    id: 'clearance-discovered-check', courseId: 'strategy', eyebrow: 'Estrategia · laboratorio', title: 'Despeje · abre la columna con jaque', piece: 'pieza',
    discipline: 'calculation', concept: 'clearance', referenceId: 'practice-taxonomy',
    fen: '3k4/8/8/3B4/8/8/8/3R2K1 w - - 0 1',
    line: [human('d5', 'e6'), reply('d8', 'e8'), human('e6', 'f7')],
    objective: 'Retira el alfil de d5 con Be6+, abre la columna d para la torre y continúa Bf7+ tras ...Ke8.',
    explanation: 'El despeje consiste en mover una pieza para liberar una línea que otra pieza necesita. Aquí el alfil abandona d5 y la torre de d1 aparece de golpe sobre el rey.',
    hint: 'La torre de d1 ya apunta al rey de d8; sólo tu propio alfil de d5 está tapando la línea.',
    success: 'Be6+ despeja la columna y Bf7+ conserva la iniciativa. No has añadido fuerza: has dejado de estorbar a la que ya tenías.',
  },
  {
    id: 'minority-break', courseId: 'strategy', eyebrow: 'Estrategia · laboratorio', title: 'Minority attack · crea un objetivo', piece: 'peón',
    discipline: 'strategy', concept: 'minority-attack', referenceId: 'lasker-strategy',
    fen: '6k1/p7/1pp5/8/1PP5/8/P7/6K1 w - - 0 1',
    line: [human('b4', 'b5')],
    objective: 'Juega b5 y usa tu minoría de peones del flanco de dama para presionar la base c6 de la mayoría negra.',
    explanation: 'Un minority attack no busca ganar espacio por estética: empuja menos peones contra más peones para provocar una debilidad fija que luego puedan atacar las piezas.',
    hint: 'El peón b4 puede avanzar a b5 y empezar a golpear c6, la base más incómoda de la cadena negra.',
    success: 'b5. Has creado un objetivo sin sacrificar nada ni inventarte un ataque al rey. Estrategia: hacer que el rival tenga algo desagradable que defender.',
  },
  {
    id: 'strategy-exam', courseId: 'strategy', eyebrow: 'Estrategia · EXAMEN', title: 'Examen de estrategia · mejora con amenaza', piece: 'torre', exam: true, maxMistakes: 1,
    discipline: 'strategy', concept: 'activity-with-tempo', referenceId: 'lasker-strategy',
    fen: '6k1/4qppp/8/8/8/8/8/R5K1 w - - 0 1', line: [human('a1', 'e1'), reply('e7', 'd6'), human('e1', 'e8')],
    objective: 'Sin pista: activa la torre con tempo y, tras la retirada de la dama, invade la octava fila con jaque.',
    explanation: 'La secuencia encadena dos principios: mejorar la peor pieza con amenaza y usar el tiempo ganado para penetrar en territorio rival.',
    success: 'Aprobado. Dos jugadas de torre y ninguna fue “porque sí”. Ya estás pensando en planes, no sólo en golpes.',
  },

  // ── FINALES ─────────────────────────────────────────────────────────────
  {
    id: 'king-before-pawn', courseId: 'endgames', eyebrow: 'Finales · 1', title: 'El rey va delante', piece: 'rey',
    discipline: 'endgame', concept: 'king-activity', referenceId: 'capablanca-fundamentals',
    fen: '8/8/8/4K3/4P3/8/8/7k w - - 0 1', line: [human('e5', 'f6')],
    objective: 'Activa el rey con Kf6 antes de empujar el peón.',
    explanation: 'En finales de peones el rey deja de esconderse y se convierte en la pieza principal. Avanzar el rey primero suele asegurar las casillas que el peón necesitará después.',
    hint: 'Acerca el rey blanco a la zona de promoción: e5-f6.',
    success: 'Kf6. En el final el rey deja de ser porcelana y empieza a trabajar. Ya era hora.',
  },
  {
    id: 'passed-pawn-push', courseId: 'endgames', eyebrow: 'Finales · 2', title: 'Empuja el peón pasado', piece: 'peón',
    discipline: 'endgame', concept: 'passed-pawn', referenceId: 'capablanca-fundamentals',
    fen: '7k/8/8/8/3P4/8/8/6K1 w - - 0 1', line: [human('d4', 'd5')],
    objective: 'Avanza el peón pasado de d4 a d5.',
    explanation: 'Un peón pasado no tiene peones enemigos en su columna ni en las adyacentes capaces de frenarlo. Su fuerza crece con cada paso hacia la promoción.',
    hint: 'El peón de d4 no tiene oposición de peones: avánzalo una casilla.',
    success: 'd5. Un peón pasado es un funcionario con expediente de ascenso. Conviene empujarlo.',
  },
  {
    id: 'rook-behind-passer', courseId: 'endgames', eyebrow: 'Finales · 3', title: 'La torre detrás del pasado', piece: 'torre',
    discipline: 'endgame', concept: 'rook-behind-passer', referenceId: 'capablanca-fundamentals',
    fen: '7k/8/8/P7/8/8/6K1/7R w - - 0 1', line: [human('h1', 'a1')],
    objective: 'Coloca la torre detrás del peón pasado de a5.',
    explanation: 'La torre detrás del peón mantiene libertad para empujarlo y aumenta su apoyo a medida que el peón avanza.',
    hint: 'Lleva la torre de h1 a a1 por la primera fila.',
    success: 'Ra1. La torre empuja desde atrás y el peón puede avanzar sin convertirla en una niñera torpe.',
  },
  {
    id: 'rook-attacks-pawn-from-behind', courseId: 'endgames', eyebrow: 'Finales · 4', title: 'Activa la torre contra el pasado', piece: 'torre',
    discipline: 'endgame', concept: 'active-rook', referenceId: 'capablanca-fundamentals',
    fen: '7k/8/p7/8/8/8/6K1/7R w - - 0 1', line: [human('h1', 'a1')],
    objective: 'Activa la torre en a1 para atacar desde detrás el peón negro de a6.',
    explanation: 'Las torres odian la pasividad. Atacar el peón pasado desde detrás obliga al rival a defenderlo mientras tu torre conserva movilidad.',
    hint: 'La columna a está libre entre tu torre y el peón negro.',
    success: 'Ra1. Misma geometría, intención opuesta: ahora la torre acosa el pasado enemigo. Las torres son criaturas coherentes.',
  },
  {
    id: 'king-shoulders-pawn', courseId: 'endgames', eyebrow: 'Finales · 5', title: 'El rey escolta al peón', piece: 'rey',
    discipline: 'endgame', concept: 'king-escort', referenceId: 'capablanca-fundamentals',
    fen: '8/8/4k3/P1K5/8/8/8/8 w - - 0 1', line: [human('c5', 'b6')],
    objective: 'Juega Kb6 para acercar el rey al peón de a5 y preparar su avance.',
    explanation: 'Un peón pasado lejos de promocionar necesita al rey cerca. Kb6 mejora el control de las casillas que el peón usará en su carrera.',
    hint: 'Acerca el rey al peón: de c5 a b6.',
    success: 'Kb6. El rey y el peón ya viajan en convoy. Mucho más sano que mandar al peón solo a morir.',
  },
  {
    id: 'pawn-opposition', courseId: 'endgames', eyebrow: 'Finales · 6', title: 'Toma la oposición', piece: 'rey',
    discipline: 'endgame', concept: 'opposition', referenceId: 'capablanca-fundamentals',
    fen: '8/4k3/8/8/4K3/4P3/8/8 w - - 0 1', line: [human('e4', 'e5')],
    objective: 'Juega Ke5 y deja un único rango entre los reyes: el turno queda en manos del defensor.',
    explanation: 'Con los reyes enfrentados y una casilla entre ambos, quien no tiene el turno conserva la oposición. Esa geometría fuerza al otro rey a ceder una vía de entrada.',
    hint: 'No empujes el peón todavía. Coloca el rey blanco en e5.',
    success: 'Ke5. El rey negro debe decidir por dónde cede terreno. Pequeña geometría, consecuencias bastante desagradables.',
  },
  {
    id: 'pawn-key-square', courseId: 'endgames', eyebrow: 'Finales · 7', title: 'Ocupa una casilla clave', piece: 'rey',
    discipline: 'endgame', concept: 'key-square', referenceId: 'capablanca-fundamentals',
    fen: '6k1/8/8/3K4/4P3/8/8/8 w - - 0 1', line: [human('d5', 'e6')],
    objective: 'Lleva el rey a e6, una casilla clave situada dos filas por delante del peón de e4.',
    explanation: 'Para un peón central aún lejos de coronar, las casillas clave están por delante de él. Si el rey ocupa una de ellas a tiempo, puede escoltar la promoción incluso contra un rey defensor.',
    hint: 'El peón está en e4. Busca la casilla central dos filas por delante: e6.',
    success: 'Ke6. El rey ya controla el terreno que necesitará el peón. En los finales, llegar antes suele importar más que parecer activo.',
  },
  {
    id: 'pawn-square-rule', courseId: 'endgames', eyebrow: 'Finales · 8', title: 'Calcula sin mover el rey', piece: 'peón',
    discipline: 'endgame', concept: 'rule-of-the-square', referenceId: 'capablanca-fundamentals',
    fen: '7k/8/8/2P5/8/8/8/K7 w - - 0 1', line: [human('c5', 'c6')],
    objective: 'Empuja c6: el rey negro está fuera del “cuadrado” del peón y no llega a tiempo.',
    explanation: 'La regla del cuadrado permite decidir una carrera sin calcular cada jaque: construye mentalmente un cuadrado desde el peón hasta la coronación. Si el rey rival no puede entrar a tiempo, el peón corre.',
    hint: 'Al peón le quedan dos avances útiles hasta coronar; el rey de h8 está demasiado lejos de c8.',
    success: 'c6. No hacía falta una novela de variantes: el rey está fuera del cuadrado y el peón puede correr.',
  },
  {
    id: 'lucena-bridge', courseId: 'endgames', eyebrow: 'Finales · 9', title: 'Lucena · construye el puente', piece: 'torre',
    discipline: 'endgame', concept: 'lucena', referenceId: 'practice-taxonomy',
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    line: [
      human('c1', 'd1'), reply('d8', 'e7'),
      human('d1', 'd4'), reply('a2', 'a1'),
      human('b8', 'c7'), reply('a1', 'c1'),
      human('c7', 'b6'), reply('c1', 'b1'),
      human('b6', 'c6'), reply('b1', 'c1'),
      human('c6', 'b5'), reply('c1', 'b1'),
      human('d4', 'b4'),
    ],
    objective: 'Ejecuta la técnica Lucena: jaquea, sube la torre a la cuarta fila, saca al rey y termina interponiendo Rb4.',
    explanation: 'La torre en cuarta fila prepara un “puente”: cuando los jaques laterales persiguen al rey, la torre se interpone y corta la serie. Entonces el peón de séptima puede coronar.',
    hint: 'Empieza con Rd1+. Tras ...Ke7, la jugada que prepara todo es Rd4. Luego camina con el rey hacia la torre hasta poder jugar Rb4.',
    success: 'Puente construido. Los jaques laterales se han acabado y el peón ya puede coronar. Esto sí es técnica de final, no esperanza.',
  },
  {
    id: 'philidor-fence', courseId: 'endgames', eyebrow: 'Finales · 10', title: 'Philidor · mantén la barrera', piece: 'torre',
    discipline: 'endgame', concept: 'philidor', referenceId: 'practice-taxonomy',
    fen: '8/4k3/r7/4PK2/8/8/8/4R3 b - - 0 1', line: [human('a6', 'c6')],
    objective: 'Juega ...Rc6 y conserva la torre en la sexta fila: no dejes pasar al rey atacante.',
    explanation: 'En Philidor, el defensor mantiene la torre en su tercera fila —la sexta vista desde blancas— mientras el peón siga en quinta. Esa barrera impide que el rey atacante penetre; cuando el peón avance, el plan cambia a jaques por detrás.',
    hint: 'No bajes la torre ni persigas el peón. Deslízala por la sexta fila: a6-c6.',
    success: '...Rc6. La barrera sigue intacta. Defender bien un final de torres consiste a menudo en no ponerse creativo justo cuando no toca.',
  },
  {
    id: 'rook-side-check', courseId: 'endgames', eyebrow: 'Finales · laboratorio', title: 'Torre activa · jaque lateral', piece: 'torre',
    discipline: 'endgame', concept: 'side-check', referenceId: 'capablanca-fundamentals',
    fen: '8/8/6k1/7p/8/8/6K1/R7 w - - 0 1',
    line: [human('a1', 'a6')],
    objective: 'Activa la torre con Ra6+ y hostiga al rey desde el lateral en vez de esperar pasivamente detrás.',
    explanation: 'En finales de torre, la actividad suele pesar más que la defensa pegada al peón. Los jaques laterales mantienen distancia y obligan al rey rival a perder tiempos.',
    hint: 'La sexta fila está libre: lleva la torre de a1 a a6 y mira toda la fila hacia g6.',
    success: 'Ra6+. La torre gana actividad con distancia de seguridad. Una torre pasiva defiende; una torre activa hace que el otro también tenga problemas.',
  },
  {
    id: 'outside-passed-pawn', courseId: 'endgames', eyebrow: 'Finales · laboratorio', title: 'Peón pasado exterior · abre dos frentes', piece: 'peón',
    discipline: 'endgame', concept: 'outside-passed-pawn', referenceId: 'capablanca-fundamentals',
    fen: '8/8/4kpp1/8/P3KPP1/8/8/8 w - - 0 1',
    line: [human('a4', 'a5')],
    objective: 'Empuja a5 y obliga al rey negro a respetar un peón pasado muy alejado de los peones del flanco de rey.',
    explanation: 'Un peón pasado exterior estira al rey defensor. Si el rey se aleja para detenerlo, el otro flanco queda más accesible para tu rey.',
    hint: 'El peón a4 no tiene peones negros enfrente ni en columnas vecinas capaces de frenarlo: avánzalo.',
    success: 'a5. Ahora el rey negro tiene dos incendios muy separados. Los finales se ganan muchas veces obligando al rey a elegir cuál apagar.',
  },
  {
    id: 'reserve-tempo-opposition', courseId: 'endgames', eyebrow: 'Finales · laboratorio', title: 'Tempo de reserva · conserva la oposición', piece: 'rey',
    discipline: 'endgame', concept: 'reserve-tempo', referenceId: 'capablanca-fundamentals',
    fen: '8/4k3/8/4K3/8/8/7P/8 w - - 0 1',
    line: [human('h2', 'h3'), reply('e7', 'f7'), human('e5', 'd6')],
    objective: 'No muevas el rey aún: juega h3 para pasar el turno, fuerza al rey negro a ceder y entra después con Kd6.',
    explanation: 'Un tempo de reserva permite mantener la geometría de oposición mientras entregas el turno al rival. El humilde peón h hace de botón de “te toca”.',
    hint: 'Los reyes ya están enfrentados en e5 y e7. Usa h2-h3 como jugada de espera antes de acercar el rey.',
    success: 'h3, ...Kf7 y Kd6. Has ganado la entrada porque conservaste un tempo fuera del duelo de reyes. Finales: donde un peón que no corre puede ser decisivo.',
  },
  {
    id: 'endgames-exam', courseId: 'endgames', eyebrow: 'Finales · EXAMEN', title: 'Examen de finales · escolta hasta coronar', piece: 'pieza', exam: true, maxMistakes: 1,
    discipline: 'endgame', concept: 'promotion-technique', referenceId: 'capablanca-fundamentals',
    fen: '7k/8/1PK5/8/8/8/8/8 w - - 0 1', line: [human('c6', 'c7'), reply('h8', 'g8'), human('b6', 'b7'), reply('g8', 'h7'), human('b7', 'b8')],
    objective: 'Sin pistas: mejora el rey, avanza el peón y corona sin perder la coordinación.',
    explanation: 'La técnica básica de conversión coordina rey y peón: el rey gana espacio, el peón avanza cuando está respaldado y la promoción llega sin carreras absurdas.',
    success: 'Aprobado. Rey activo, peón acompañado y promoción. Los finales dejan de parecer magia cuando el orden de trabajo es correcto.',
  },

]);

export function schoolLessonById(id) {
  return MATTHIAS_SCHOOL_LESSONS.find((lesson) => lesson.id === id) || null;
}

export function schoolCourseById(id) {
  return MATTHIAS_SCHOOL_COURSES.find((course) => course.id === id) || null;
}

const COURSE_DISCIPLINE = Object.freeze({
  basic: 'fundamentals',
  'basic-medium': 'opening',
  medium: 'tactics',
  'medium-advanced': 'calculation',
  advanced: 'calculation',
  strategy: 'strategy',
  endgames: 'endgame',
});

export function schoolLessonMetadata(lesson) {
  if (!lesson) return null;
  const course = schoolCourseById(lesson.courseId);
  const referenceId = lesson.referenceId || null;
  return {
    difficulty: Number(course?.rank || 1),
    discipline: lesson.discipline || COURSE_DISCIPLINE[lesson.courseId] || 'general',
    concept: lesson.concept || null,
    referenceId,
    reference: referenceId ? MATTHIAS_SCHOOL_REFERENCES[referenceId] || null : null,
  };
}

export function schoolLessonsForCourse(courseId) {
  return MATTHIAS_SCHOOL_LESSONS.filter((lesson) => lesson.courseId === courseId);
}

export function schoolExamForCourse(courseId) {
  return schoolLessonsForCourse(courseId).find((lesson) => lesson.exam) || null;
}

export function loadMatthiasSchoolProgress() {
  try {
    const raw = JSON.parse(getStorageItem(STORAGE_LOCAL, MATTHIAS_SCHOOL_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function isSchoolCoursePassed(progress, courseId) {
  const exam = schoolExamForCourse(courseId);
  return Boolean(exam && progress?.[exam.id]?.completed === true);
}

export function isSchoolCourseUnlocked(progress, courseId) {
  const index = MATTHIAS_SCHOOL_COURSES.findIndex((course) => course.id === courseId);
  if (index <= 0) return index === 0;
  return MATTHIAS_SCHOOL_COURSES.slice(0, index).every((course) => isSchoolCoursePassed(progress, course.id));
}

export function isSchoolCourseAccessible(progress, courseId, { freeStudy = false } = {}) {
  return freeStudy ? Boolean(schoolCourseById(courseId)) : isSchoolCourseUnlocked(progress, courseId);
}

export function isSchoolLessonUnlocked(progress, lessonId) {
  const lesson = schoolLessonById(lessonId);
  if (!lesson || !isSchoolCourseUnlocked(progress, lesson.courseId)) return false;
  const lessons = schoolLessonsForCourse(lesson.courseId);
  const index = lessons.findIndex((item) => item.id === lesson.id);
  if (index <= 0) return index === 0;
  return lessons.slice(0, index).every((item) => progress?.[item.id]?.completed === true);
}

export function isSchoolLessonAccessible(progress, lessonId, { freeStudy = false } = {}) {
  const lesson = schoolLessonById(lessonId);
  if (!lesson) return false;
  return freeStudy || isSchoolLessonUnlocked(progress, lessonId) || progress?.[lessonId]?.completed === true;
}

export function markMatthiasSchoolLessonComplete(id, now = new Date()) {
  if (!schoolLessonById(id)) return loadMatthiasSchoolProgress();
  const current = loadMatthiasSchoolProgress();
  const previous = current[id] && typeof current[id] === 'object' ? current[id] : {};
  const next = {
    ...current,
    [id]: {
      completed: true,
      attempts: Math.max(1, Number(previous.attempts || 0) + 1),
      completedAt: now.toISOString(),
    },
  };
  setProfileStorageItem(MATTHIAS_SCHOOL_KEY, JSON.stringify(next));
  return next;
}

export function incrementMatthiasSchoolAttempt(id) {
  if (!schoolLessonById(id)) return loadMatthiasSchoolProgress();
  const current = loadMatthiasSchoolProgress();
  const previous = current[id] && typeof current[id] === 'object' ? current[id] : {};
  const next = {
    ...current,
    [id]: {
      ...previous,
      attempts: Number(previous.attempts || 0) + 1,
    },
  };
  setProfileStorageItem(MATTHIAS_SCHOOL_KEY, JSON.stringify(next));
  return next;
}

export function matthiasSchoolCourseSummary(courseId, progress = loadMatthiasSchoolProgress()) {
  const course = schoolCourseById(courseId);
  const lessons = schoolLessonsForCourse(courseId);
  const completed = lessons.filter((lesson) => progress?.[lesson.id]?.completed === true).length;
  const passed = isSchoolCoursePassed(progress, courseId);
  return {
    course,
    completed,
    total: lessons.length,
    passed,
    unlocked: isSchoolCourseUnlocked(progress, courseId),
    examId: lessons.find((lesson) => lesson.exam)?.id || null,
  };
}

export function matthiasSchoolSummary(progress = loadMatthiasSchoolProgress()) {
  const completed = MATTHIAS_SCHOOL_LESSONS.filter((lesson) => progress?.[lesson.id]?.completed === true).length;
  const total = MATTHIAS_SCHOOL_LESSONS.length;
  const courses = MATTHIAS_SCHOOL_COURSES.map((course) => matthiasSchoolCourseSummary(course.id, progress));
  const passedCourses = courses.filter((item) => item.passed).length;
  const currentCourseSummary = courses.find((item) => !item.passed) || courses.at(-1) || null;
  const nextLesson = MATTHIAS_SCHOOL_LESSONS.find((lesson) => isSchoolLessonUnlocked(progress, lesson.id) && progress?.[lesson.id]?.completed !== true)
    || MATTHIAS_SCHOOL_LESSONS.at(-1);
  return {
    completed,
    total,
    complete: passedCourses === MATTHIAS_SCHOOL_COURSES.length,
    passedCourses,
    totalCourses: MATTHIAS_SCHOOL_COURSES.length,
    currentCourseId: currentCourseSummary?.course?.id || null,
    currentCourseLabel: currentCourseSummary?.course?.label || null,
    currentCourseCompleted: currentCourseSummary?.completed || 0,
    currentCourseTotal: currentCourseSummary?.total || 0,
    nextLessonId: nextLesson?.id || null,
    courses,
  };
}

export function schoolLineForLesson(lesson) {
  if (Array.isArray(lesson?.line) && lesson.line.length) return lesson.line;
  if (lesson?.from && lesson?.to) return [human(lesson.from, lesson.to)];
  return [];
}

export function nextHumanSchoolStep(lesson, fromIndex = 0) {
  const line = schoolLineForLesson(lesson);
  for (let index = Math.max(0, fromIndex); index < line.length; index += 1) {
    if (!line[index].auto) return { ...line[index], index };
  }
  return null;
}

export function schoolBoardGuideMove(lesson, expected, { hintActive = false } = {}) {
  if (!lesson || lesson.exam || !expected?.from) return null;
  if (hintActive && expected.to) return { from: expected.from, to: expected.to };
  return { from: expected.from };
}

export function validateMatthiasSchoolMove(lesson, from, to, { fen = lesson?.fen, lineIndex = 0 } = {}) {
  if (!lesson || !from || !to || !fen) return { ok: false, reason: 'missing' };
  const expected = nextHumanSchoolStep(lesson, lineIndex);
  if (!expected) return { ok: false, reason: 'complete' };
  try {
    const board = new Chess(fen);
    const move = board.move({ from, to, promotion: 'q' });
    if (!move) return { ok: false, reason: 'illegal' };
    const solves = from === expected.from && to === expected.to;
    return { ok: solves, reason: solves ? 'success' : 'legal-wrong', san: move.san, expected };
  } catch {
    return { ok: false, reason: 'illegal' };
  }
}
