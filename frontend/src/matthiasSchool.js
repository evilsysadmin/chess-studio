import { Chess } from 'chess.js';
import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

export const MATTHIAS_SCHOOL_KEY = 'chess-study-matthias-school-v1';

export const MATTHIAS_SCHOOL_LESSONS = Object.freeze([
  {
    id: 'pawn-double-step',
    eyebrow: 'Fundamentos · 1',
    title: 'El peón avanza',
    piece: 'peón',
    fen: '7k/8/8/8/8/8/4P3/K7 w - - 0 1',
    from: 'e2', to: 'e4',
    objective: 'Lleva el peón blanco de e2 a e4.',
    explanation: 'Desde su casilla inicial un peón puede avanzar una o dos casillas si el camino está libre. Después, normalmente sólo una.',
    hint: 'Selecciona e2 y busca el salto de dos casillas hacia e4. Hacia delante, no en diagonal: todavía no estamos capturando nada.',
    success: 'Bien. Dos casillas y ningún tratado internacional roto. El peón avanza de frente.',
  },
  {
    id: 'pawn-capture',
    eyebrow: 'Fundamentos · 2',
    title: 'El peón captura distinto',
    piece: 'peón',
    fen: '7k/8/8/8/8/5n2/4P3/K7 w - - 0 1',
    from: 'e2', to: 'f3',
    objective: 'Captura el caballo negro de f3 con el peón de e2.',
    explanation: 'El peón avanza de frente, pero captura una casilla en diagonal. Sí, alguien decidió que esto era intuitivo.',
    hint: 'Desde e2, el caballo está exactamente una diagonal hacia delante: f3.',
    success: 'Correcto. El peón no captura de frente: muerde en diagonal. Ya puedes aterrorizar damas mal aparcadas.',
  },
  {
    id: 'rook-lines',
    eyebrow: 'Fundamentos · 3',
    title: 'La torre va por raíles',
    piece: 'torre',
    fen: '7k/3p4/8/8/3R4/8/8/K7 w - - 0 1',
    from: 'd4', to: 'd7',
    objective: 'Captura el peón de d7 con la torre de d4.',
    explanation: 'La torre se desplaza tantas casillas como quiera en horizontal o vertical. No gira en mitad del viaje y no salta piezas.',
    hint: 'd4 y d7 comparten columna. Sube por la columna d hasta el peón.',
    success: 'Exacto. Línea recta, captura, fin. La torre aprecia la burocracia simple.',
  },
  {
    id: 'bishop-diagonal',
    eyebrow: 'Fundamentos · 4',
    title: 'El alfil vive en diagonal',
    piece: 'alfil',
    fen: 'k7/8/1n6/8/3B4/8/8/7K w - - 0 1',
    from: 'd4', to: 'b6',
    objective: 'Captura el caballo de b6 con el alfil de d4.',
    explanation: 'El alfil se mueve sólo en diagonal y nunca cambia de color de casilla. Cada alfil está condenado a media geografía del tablero.',
    hint: 'Desde d4, sube dos diagonales hacia la izquierda: c5, b6.',
    success: 'Bien. Diagonal limpia. El alfil seguirá en casillas del mismo color hasta el fin de los tiempos.',
  },
  {
    id: 'knight-jump',
    eyebrow: 'Fundamentos · 5',
    title: 'El caballo ignora el tráfico',
    piece: 'caballo',
    fen: 'k7/8/8/5p2/3N4/8/8/7K w - - 0 1',
    from: 'd4', to: 'f5',
    objective: 'Captura el peón de f5 con el caballo de d4.',
    explanation: 'El caballo hace una L: dos casillas en una dirección y una perpendicular. Además salta por encima de cualquier pieza.',
    hint: 'De d4 a f5 hay dos columnas y una fila. Esa L es exactamente territorio de caballo.',
    success: 'Eso es. Una L absurda y perfectamente legal. Por eso los caballos fabrican horquillas con tanta mala baba.',
  },
  {
    id: 'queen-power',
    eyebrow: 'Fundamentos · 6',
    title: 'La dama hace casi de todo',
    piece: 'dama',
    fen: '1k6/3p4/8/3Q4/8/8/8/1K6 w - - 0 1',
    from: 'd5', to: 'd7',
    objective: 'Captura el peón de d7 con la dama de d5.',
    explanation: 'La dama combina torre y alfil: rectas y diagonales, tantas casillas como tenga libres. Poderosa, sí; inmortal, no.',
    hint: 'La dama y el peón comparten la columna d. Dos casillas hacia arriba.',
    success: 'Correcto. Mucha potencia. Ahora recuerda la parte difícil: no regalarla a un peón.',
  },
  {
    id: 'king-step',
    eyebrow: 'Fundamentos · 7',
    title: 'El rey camina, no corre',
    piece: 'rey',
    fen: '7k/8/8/8/3K4/8/8/8 w - - 0 1',
    from: 'd4', to: 'e4',
    objective: 'Mueve el rey blanco de d4 a e4.',
    explanation: 'El rey mueve una casilla en cualquier dirección y jamás puede entrar en una casilla atacada.',
    hint: 'e4 está justo al lado de d4. Una sola casilla horizontal.',
    success: 'Bien. Una casilla. El rey no tiene prisa; tiene súbditos para eso.',
  },
  {
    id: 'castle-short',
    eyebrow: 'Fundamentos · 8',
    title: 'Enroque corto',
    piece: 'rey',
    fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1',
    from: 'e1', to: 'g1',
    objective: 'Enrócate corto: mueve el rey de e1 a g1.',
    explanation: 'En el enroque se mueven rey y torre en una sola jugada. Hace falta que no se hayan movido, que el camino esté libre y que el rey no atraviese jaque.',
    hint: 'Selecciona el rey de e1. g1 aparece como destino legal; Chess Studio moverá también la torre.',
    success: 'Correcto. Rey a cubierto, torre activada. Por una vez dos piezas han hecho su trabajo a la vez.',
  },
  {
    id: 'mate-one',
    eyebrow: 'Fundamentos · examen',
    title: 'Remata: mate en una',
    piece: 'dama',
    fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
    from: 'f7', to: 'g7',
    objective: 'Da jaque mate en una jugada.',
    explanation: 'No basta con dar jaque: el rey rival debe quedarse sin captura, bloqueo ni casilla de escape.',
    hint: 'La dama puede entrar en g7 protegida por tu rey de g6. Comprueba qué casillas le quedan al rey negro.',
    success: 'Mate. Perfecto. Ya sabes mover las piezas y terminar una partida. El resto consiste en no hacer barbaridades entre medias.',
  },
]);

export function schoolLessonById(id) {
  return MATTHIAS_SCHOOL_LESSONS.find((lesson) => lesson.id === id) || null;
}

export function loadMatthiasSchoolProgress() {
  try {
    const raw = JSON.parse(getStorageItem(STORAGE_LOCAL, MATTHIAS_SCHOOL_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
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

export function matthiasSchoolSummary(progress = loadMatthiasSchoolProgress()) {
  const completed = MATTHIAS_SCHOOL_LESSONS.filter((lesson) => progress?.[lesson.id]?.completed === true).length;
  const total = MATTHIAS_SCHOOL_LESSONS.length;
  const nextLesson = MATTHIAS_SCHOOL_LESSONS.find((lesson) => progress?.[lesson.id]?.completed !== true) || MATTHIAS_SCHOOL_LESSONS.at(-1);
  return { completed, total, complete: completed === total, nextLessonId: nextLesson?.id || null };
}

export function validateMatthiasSchoolMove(lesson, from, to) {
  if (!lesson || !from || !to) return { ok: false, reason: 'missing' };
  try {
    const board = new Chess(lesson.fen);
    const move = board.move({ from, to, promotion: 'q' });
    if (!move) return { ok: false, reason: 'illegal' };
    const solves = from === lesson.from && to === lesson.to;
    return { ok: solves, reason: solves ? 'success' : 'legal-wrong', san: move.san };
  } catch {
    return { ok: false, reason: 'illegal' };
  }
}
