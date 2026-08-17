// gameReport.js — Informe post-partida: revisa las jugadas del humano
// comparándolas contra lo que el motor hubiera preferido en cada momento,
// y arma un resumen con la peor jugada y una valoración general.

import { Chess } from 'chess.js';

// Cuánto peor fue la jugada jugada respecto a la sugerida, en "centipawns"
// (la unidad de evaluación de ai.js), desde la perspectiva de quien movió.
// Siempre >= 0: si el humano jugó igual o mejor de lo que el motor
// esperaba, el resultado es 0 — nunca "sobre-premiamos" una jugada.
export function moveLoss(moverColor, evalAfterSuggested, evalAfterPlayed) {
  if (evalAfterSuggested === null || evalAfterPlayed === null) return null;
  if (!Number.isFinite(evalAfterSuggested) || !Number.isFinite(evalAfterPlayed)) return null; // jaque mate en el medio, no comparable
  const sign = moverColor === 'w' ? 1 : -1;
  const loss = sign * (evalAfterSuggested - evalAfterPlayed);
  return Math.max(0, Math.round(loss));
}

// Valoración general en base a la pérdida promedio por jugada.
export function performanceLabel(averageLoss) {
  if (averageLoss < 20) return 'Jugaste con mucha precisión.';
  if (averageLoss < 60) return 'Jugaste bastante bien, con algún desliz.';
  if (averageLoss < 150) return 'Hubo unas cuantas jugadas para revisar.';
  return 'Varias jugadas se alejaron bastante de lo que el motor hubiera preferido.';
}

// Clasifica una jugada individual según cuánto perdió — se usa para
// colorear el cuaderno de jugadas en la reconstrucción visual (verde/nada,
// amarillo, naranja, rojo), igual de un vistazo que un semáforo.
export function mistakeSeverity(loss) {
  if (loss === null) return 'unrated'; // no se analizó (jugada de la CPU, o fuera de la ventana analizada)
  if (loss < 20) return 'ok';
  if (loss < 60) return 'inaccuracy';
  if (loss < 150) return 'mistake';
  return 'blunder';
}

// Throttle compartido para las llamadas a analyzeMove — asegura al menos
// ~400ms entre CUALQUIER par de llamadas, sin importar desde qué función o
// partida vengan. Sin esto, analyzeGame/analyzeCombatLog disparan
// requests tan rápido como responde el servidor, y en niveles bajos eso
// es rápido — de sobra para superar el límite del backend en cuanto se
// encadenan varias partidas (como hace "Buscar mi peor jugada de
// siempre"). El resultado real, visto en producción cuando el límite era
// 60/minuto: docenas de 429 seguidos, con el análisis de esas jugadas
// perdido en silencio (atrapado por el try/catch de abajo) en vez de
// fallar de forma visible. El límite del servidor subió después a
// 180/minuto, y este throttle bajó de 1.1s a 400ms en proporción.
let lastAnalyzeMoveCallAt = 0;
const ANALYZE_MOVE_MIN_GAP_MS = 400; // el límite del servidor subió a 180/min (antes 60) — 400ms da ~150/min,
// con margen real bajo el tope nuevo, sin ir tan rápido como el límite permitiría (un hosting gratuito
// puede sostener menos de lo que el contador de requests autoriza en el papel)

async function throttledAnalyzeMove(api, fen, from, to, promotion, level, gapMs = ANALYZE_MOVE_MIN_GAP_MS) {
  const wait = Math.max(0, lastAnalyzeMoveCallAt + gapMs - Date.now());
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastAnalyzeMoveCallAt = Date.now();
  return api.analyzeMove(fen, from, to, promotion, level);
}

// Analiza el historial completo de una partida terminada, llamando al
// backend una vez por cada jugada del humano (hasta `maxMoves`, para no
// hacer esperar una eternidad en partidas largas — se queda con las
// últimas, que suelen ser las más relevantes para revisar).
export async function analyzeGame(history, humanColor, api, options = {}) {
  const { level = 45, maxMoves = 24, throttleMs = ANALYZE_MOVE_MIN_GAP_MS } = options;
  const chess = new Chess();

  const humanMoveIndices = [];
  for (let i = 0; i < history.length; i++) {
    const moverColor = i % 2 === 0 ? 'w' : 'b';
    if (moverColor === humanColor) humanMoveIndices.push(i);
  }
  const toAnalyze = new Set(humanMoveIndices.slice(-maxMoves));

  const moveReports = [];
  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const fenBefore = chess.fen();
    const moverColor = i % 2 === 0 ? 'w' : 'b';

    if (moverColor === humanColor && toAnalyze.has(i)) {
      try {
        const result = await throttledAnalyzeMove(api, fenBefore, entry.from, entry.to, undefined, level, throttleMs);
        const loss = moveLoss(humanColor, result.evalAfterSuggested, result.evalAfterPlayed);
        moveReports.push({
          index: i, // posición en `history` — para ubicar esta jugada al recorrer la partida
          moveNumber: Math.floor(i / 2) + 1,
          played: entry.san,
          playedFrom: entry.from,
          playedTo: entry.to,
          playedPiece: entry.piece,
          suggested: result.suggested.san,
          suggestedFrom: result.suggested.from,
          suggestedTo: result.suggested.to,
          suggestedPiece: result.suggested.piece,
          loss,
          severity: mistakeSeverity(loss),
        });
      } catch (e) {
        // si falla el análisis de una jugada puntual, seguimos con el resto
      }
    }

    chess.move(entry.san);
  }

  const withLoss = moveReports.filter((m) => m.loss !== null);
  const averageLoss = withLoss.length ? withLoss.reduce((sum, m) => sum + m.loss, 0) / withLoss.length : 0;
  const worst = withLoss.length ? withLoss.reduce((a, b) => (b.loss > a.loss ? b : a)) : null;
  const sortedWorst = [...withLoss].sort((a, b) => b.loss - a.loss).slice(0, 3);

  return {
    analyzedCount: withLoss.length,
    averageLoss: Math.round(averageLoss),
    worst,
    topMistakes: sortedWorst,
    label: performanceLabel(averageLoss),
    moveReports, // el listado COMPLETO, jugada por jugada — para la reconstrucción visual
  };
}

// Igual que analyzeGame, pero para el registro de una batalla de Combate
// (ver combatHistory.js). Solo analiza los intentos que CONECTARON (los
// fallos/esquives ni se registran en el log — ver comentario en
// CombatScreen.jsx sobre por qué). Se usa `fenBefore` + `from`/`to` de cada
// entrada directamente, en vez de reproducir el registro con chess.js.
export async function analyzeCombatLog(log, humanColor, api, options = {}) {
  const { level = 45, maxMoves = 24, throttleMs = ANALYZE_MOVE_MIN_GAP_MS } = options;

  const humanIndices = [];
  for (let i = 0; i < log.length; i++) {
    if (log[i].by === 'human') humanIndices.push(i);
  }
  const toAnalyze = new Set(humanIndices.slice(-maxMoves));

  const moveReports = [];
  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    if (entry.by !== 'human' || !toAnalyze.has(i)) continue;
    try {
      const result = await throttledAnalyzeMove(api, entry.fenBefore, entry.from, entry.to, undefined, level, throttleMs);
      const loss = moveLoss(humanColor, result.evalAfterSuggested, result.evalAfterPlayed);
      moveReports.push({
        index: i,
        played: entry.san,
        playedFrom: entry.from,
        playedTo: entry.to,
        playedPiece: entry.piece,
        suggested: result.suggested.san,
        suggestedFrom: result.suggested.from,
        suggestedTo: result.suggested.to,
        suggestedPiece: result.suggested.piece,
        loss,
        severity: mistakeSeverity(loss),
      });
    } catch (e) {
      // si falla el análisis de una jugada puntual, seguimos con el resto
    }
  }

  const withLoss = moveReports.filter((m) => m.loss !== null);
  const averageLoss = withLoss.length ? withLoss.reduce((sum, m) => sum + m.loss, 0) / withLoss.length : 0;
  const worst = withLoss.length ? withLoss.reduce((a, b) => (b.loss > a.loss ? b : a)) : null;
  const sortedWorst = [...withLoss].sort((a, b) => b.loss - a.loss).slice(0, 3);

  return {
    analyzedCount: withLoss.length,
    averageLoss: Math.round(averageLoss),
    worst,
    topMistakes: sortedWorst,
    label: performanceLabel(averageLoss),
    moveReports,
  };
}

// Recorre TODO el historial guardado (partidas normales/torneo/práctica +
// batallas de combate) buscando la jugada individual con más pérdida de
// evaluación de todas — esto es justo lo que "Así juegas" NO hace
// automáticamente por ser caro (podría ser hasta 50 partidas × 24 jugadas
// cada una = cientos de llamadas al backend). Por eso vive aparte, como
// algo que se dispara a demanda con un botón, no como parte del cálculo
// instantáneo de insights.js.
//
// Procesa las partidas de a una (no en paralelo, para no saturar el
// backend con docenas de conexiones a la vez), avisando progreso después
// de cada una via `onProgress(done, total, bestSoFar)` — así la pantalla
// puede mostrar "iendo por la partida 7 de 23" en vez de una espera muda,
// y actualizar el resultado parcial encontrado hasta el momento incluso si
// se cancela a mitad de camino. `shouldStop()` se consulta entre cada
// partida para poder cortar limpio.
export async function findWorstMoveEver(gameHistory, combatHistory, api, onProgress, shouldStop, options = {}) {
  const { throttleMs = ANALYZE_MOVE_MIN_GAP_MS, cache = {} } = options;
  const records = [
    ...gameHistory.map((r) => ({ record: r, kind: 'game' })),
    ...combatHistory.map((r) => ({ record: r, kind: 'combat' })),
  ];

  // Podamos el caché a lo que existe hoy: una partida borrada del
  // historial (MAX_RECORDS la empuja afuera con el tiempo) no debería
  // dejar una entrada muerta creciendo en Mongo para siempre.
  const validIds = new Set(records.map((r) => r.record.id));
  const updatedCache = {};
  for (const id of Object.keys(cache)) {
    if (validIds.has(id)) updatedCache[id] = cache[id];
  }

  let best = null; // { record, kind, moveReport }
  const total = records.length;

  for (let i = 0; i < total; i++) {
    if (shouldStop && shouldStop()) break;
    const { record, kind } = records[i];

    try {
      let worst;
      if (updatedCache[record.id] !== undefined) {
        // Ya se analizó en una búsqueda anterior — una partida terminada
        // nunca cambia, así que el resultado de la vez pasada sigue
        // siendo válido. Nos ahorramos toda la ronda de llamadas al
        // backend para esta partida.
        worst = updatedCache[record.id].worst;
      } else {
        const report = kind === 'combat'
          ? await analyzeCombatLog(record.log, record.humanColor, api, { throttleMs })
          : await analyzeGame(record.moves, record.humanColor, api, { throttleMs });
        worst = report.worst || null;
        updatedCache[record.id] = { worst, analyzedAt: new Date().toISOString() };
      }

      if (worst && (!best || worst.loss > best.moveReport.loss)) {
        best = { record, kind, moveReport: worst };
      }
    } catch (e) {
      // si falla el análisis de una partida puntual, seguimos con las demás
    }

    if (onProgress) onProgress(i + 1, total, best);
  }

  return { best, cache: updatedCache };
}
