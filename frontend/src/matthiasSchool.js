import { Chess } from 'chess.js';
import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

export const MATTHIAS_SCHOOL_KEY = 'chess-study-matthias-school-v1';

export const MATTHIAS_SCHOOL_COURSES = Object.freeze([
  { id: 'basic', label: 'Básico', shortLabel: 'Básico', rank: 1, description: 'Cómo se mueven las piezas, capturas, rey seguro y mate elemental.' },
  { id: 'basic-medium', label: 'Básico-medio', shortLabel: 'Básico-medio', rank: 2, description: 'Desarrollo, centro, tempos y primeras secuencias de varias jugadas.' },
  { id: 'medium', label: 'Medio', shortLabel: 'Medio', rank: 3, description: 'Patrones tácticos, promoción y coordinación para rematar.' },
  { id: 'medium-advanced', label: 'Medio-avanzado', shortLabel: 'Medio-avanzado', rank: 4, description: 'Cálculo de líneas forzadas, redes de mate y coordinación multipieza.' },
  { id: 'advanced', label: 'Avanzado', shortLabel: 'Avanzado', rank: 5, description: 'Sacrificios justificados, desviación y cálculo preciso sin red de seguridad.' },
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
    objective: 'Enrócate corto: mueve el rey de e1 a g1.',
    explanation: 'En el enroque se mueven rey y torre en una sola jugada. Hace falta que no se hayan movido, que el camino esté libre y que el rey no atraviese jaque.',
    hint: 'Selecciona el rey de e1. g1 aparece como destino legal; Chess Studio moverá también la torre.',
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
    hint: 'Alfil f1-b5, retíralo a a4 tras ...a6 y después enrócate cuando ...Nf6 deje el turno en tus manos.',
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
]);

export function schoolLessonById(id) {
  return MATTHIAS_SCHOOL_LESSONS.find((lesson) => lesson.id === id) || null;
}

export function schoolCourseById(id) {
  return MATTHIAS_SCHOOL_COURSES.find((course) => course.id === id) || null;
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
  return isSchoolCoursePassed(progress, MATTHIAS_SCHOOL_COURSES[index - 1].id);
}

export function isSchoolLessonUnlocked(progress, lessonId) {
  const lesson = schoolLessonById(lessonId);
  if (!lesson || !isSchoolCourseUnlocked(progress, lesson.courseId)) return false;
  const lessons = schoolLessonsForCourse(lesson.courseId);
  const index = lessons.findIndex((item) => item.id === lesson.id);
  if (index <= 0) return index === 0;
  return lessons.slice(0, index).every((item) => progress?.[item.id]?.completed === true);
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

export function applySchoolLineStep(fen, step) {
  try {
    const board = new Chess(fen);
    const move = board.move({ from: step.from, to: step.to, promotion: 'q' });
    if (!move) return { ok: false, fen, reason: 'illegal' };
    return { ok: true, fen: board.fen(), san: move.san };
  } catch {
    return { ok: false, fen, reason: 'illegal' };
  }
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
