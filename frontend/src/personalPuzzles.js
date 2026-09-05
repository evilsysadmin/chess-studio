import { STORAGE_LOCAL, STORAGE_SESSION, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';
import { Chess } from 'chess.js';
import { setProfileStorageItem } from './profileKeys.js';
import { detectNoteworthyMove } from './cpuCommentary.js';
import { isObviouslyUnsoundSingleMovePuzzle } from './puzzleTacticalQuality.js';
import { provesCurrentPersonalPuzzleQuality } from './personalPuzzleQuality.js';
import { spacedReviewResultPatch } from './spacedReview.js';

const KEY = 'chess-study-personal-puzzles';
const FOCUS_KEY = 'chess-study-personal-puzzle-focus';
const MAX_PUZZLES = 40;

export function loadPersonalPuzzles() {
  try {
    const raw = getStorageItem(STORAGE_LOCAL, KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeStoredPuzzle).filter(isPlayablePersonalPuzzle) : [];
  } catch {
    return [];
  }
}

export function isPlayablePersonalPuzzle(puzzle) {
  if (!puzzle?.fen || !Array.isArray(puzzle?.solution) || puzzle.solution.length === 0) return false;
  try {
    const board = new Chess(puzzle.fen);
    if (board.isGameOver()) return false;
    for (const san of puzzle.solution) {
      const move = board.move(san);
      if (!move) return false;
    }
    if (puzzle.source === 'workers-ai-validated') {
      // Un puzzle de IA persistido antes del contrato actual no vuelve a la
      // cola por inercia. Si no puede demostrar que pasó los gates vigentes,
      // se retira silenciosamente y podrá ser regenerado desde semillas reales.
      if (!provesCurrentPersonalPuzzleQuality(puzzle)) return false;
      if (isObviouslyUnsoundSingleMovePuzzle(puzzle)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function normalizeStoredPuzzle(puzzle) {
  if (!puzzle || typeof puzzle !== 'object') return puzzle;
  if (Array.isArray(puzzle.incidentKeys)) return puzzle;
  if (!puzzle.fen || !puzzle.played) return { ...puzzle, incidentKeys: [] };
  try {
    const board = new Chess(puzzle.fen);
    const move = board.move(puzzle.played);
    if (!move) return { ...puzzle, incidentKeys: [] };
    const event = detectNoteworthyMove(puzzle.fen, { from: move.from, to: move.to, promotion: move.promotion });
    return { ...puzzle, incidentKeys: event?.type ? [`human:${event.type}`] : [] };
  } catch {
    return { ...puzzle, incidentKeys: [] };
  }
}

export function isPersonalPuzzleMastered(puzzle) {
  return Boolean(puzzle?.masteredAt) || Number(puzzle?.solves || 0) > 0;
}

function detectIncidentKeys(fenBefore, moveReport) {
  const keys = [];
  const played = moveReport?.playedFrom && moveReport?.playedTo
    ? { from: moveReport.playedFrom, to: moveReport.playedTo, promotion: moveReport.playedPromotion || undefined }
    : (() => {
        if (!fenBefore || !moveReport?.played) return null;
        try {
          const board = new Chess(fenBefore);
          const move = board.move(moveReport.played);
          return move ? { from: move.from, to: move.to, promotion: move.promotion } : null;
        } catch { return null; }
      })();

  if (played) {
    const event = detectNoteworthyMove(fenBefore, played);
    if (event?.type) keys.push(`human:${event.type}`);
  }

  const reply = moveReport?.context?.reply;
  const replyFen = moveReport?.context?.played?.fenAfter;
  if (replyFen && reply?.from && reply?.to) {
    const event = detectNoteworthyMove(replyFen, { from: reply.from, to: reply.to, promotion: reply.promotion });
    if (event?.type) keys.push(`cpu:${event.type}`);
  }

  return [...new Set(keys)];
}

export function matchesPersonalPuzzleFilter(puzzle, filter = null) {
  if (!filter) return true;
  if (filter.opening && puzzle?.opening !== filter.opening) return false;
  if (filter.incidentKey && !(puzzle?.incidentKeys || []).includes(filter.incidentKey)) return false;
  return true;
}

function stableId(fen, suggested) {
  let hash = 2166136261;
  const text = `${fen}|${suggested}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `personal-${(hash >>> 0).toString(36)}`;
}

// Canonical reconstruction contract shared by persisted personal puzzles and
// the immediate post-game exam. The exam only hides the explanatory spoiler
// until after the move; it does not bypass the legal FEN/solution gate.
export function personalPuzzleFromMistake(history, humanColor, moveReport, meta = {}) {
  if (!moveReport || !Array.isArray(history) || !moveReport.suggested || moveReport.loss < 80) return null;
  if (moveReport.played && moveReport.suggested === moveReport.played) return null;
  let chess;
  try {
    chess = meta.initialFen ? new Chess(meta.initialFen) : new Chess();
    for (let i = 0; i < moveReport.index; i++) {
      const entry = history[i];
      const applied = entry?.from && entry?.to
        ? chess.move({ from: entry.from, to: entry.to, promotion: entry.promotion || 'q' })
        : chess.move(entry.san);
      if (!applied) return null;
    }
  } catch {
    return null;
  }
  if (chess.turn() !== humanColor) return null;
  const fen = chess.fen();
  try {
    const probe = new Chess(fen);
    probe.move(moveReport.suggested);
  } catch {
    return null;
  }

  return {
    id: stableId(fen, moveReport.suggested),
    kind: 'personal',
    title: moveReport.loss >= 300 ? 'Escena del crimen' : 'Cuenta pendiente',
    description: `Aquí jugaste ${moveReport.played} y perdiste ~${moveReport.loss} cp. Encuentra la jugada que el motor prefería.`,
    fen,
    solution: [moveReport.suggested],
    source: 'autopsy',
    createdAt: new Date().toISOString(),
    loss: moveReport.loss,
    played: moveReport.played,
    suggested: moveReport.suggested,
    moveNumber: moveReport.moveNumber ?? (Math.floor(moveReport.index / 2) + 1),
    difficulty: meta.difficulty ?? null,
    mode: meta.mode ?? null,
    opening: meta.opening || null,
    sourceGameId: meta.gameId || null,
    humanColor,
    incidentKeys: detectIncidentKeys(fen, moveReport),
  };
}

export function savePersonalPuzzlesFromReport(history, humanColor, report, meta = {}) {
  const candidates = (report?.topMistakes || [])
    .filter((m) => m.loss >= 80)
    .slice(0, 2)
    .map((m) => personalPuzzleFromMistake(history, humanColor, m, meta))
    .filter(Boolean);
  if (!candidates.length) return { added: 0, total: loadPersonalPuzzles().length };

  const current = loadPersonalPuzzles();
  const byId = new Map(current.map((p) => [p.id, p]));
  let added = 0;
  let changed = false;
  for (const puzzle of candidates) {
    const previous = byId.get(puzzle.id);
    if (!previous) added += 1;
    const merged = previous ? {
      ...previous,
      ...puzzle,
      createdAt: previous.createdAt || puzzle.createdAt,
      attempts: Number(previous.attempts || 0),
      solves: Number(previous.solves || 0),
      cleanSolves: Number(previous.cleanSolves || 0),
      lastAttemptAt: previous.lastAttemptAt || null,
      lastSolvedAt: previous.lastSolvedAt || null,
      masteredAt: previous.masteredAt || null,
    } : puzzle;
    if (!previous || JSON.stringify(previous) !== JSON.stringify(merged)) changed = true;
    byId.set(puzzle.id, merged);
  }
  const next = [...byId.values()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, MAX_PUZZLES);
  if (changed) setProfileStorageItem(KEY, JSON.stringify(next));
  return { added, total: next.length };
}

export function personalPuzzlesForFilter(filter = null, { includeMastered = false, masteredOnly = false } = {}) {
  return loadPersonalPuzzles().filter((puzzle) => {
    if (!matchesPersonalPuzzleFilter(puzzle, filter)) return false;
    const mastered = isPersonalPuzzleMastered(puzzle);
    if (masteredOnly) return mastered;
    return includeMastered || !mastered;
  });
}

export function personalPuzzleHistory(filter = null) {
  return personalPuzzlesForFilter(filter, { masteredOnly: true })
    .sort((a, b) => new Date(b.masteredAt || b.lastSolvedAt || b.createdAt || 0) - new Date(a.masteredAt || a.lastSolvedAt || a.createdAt || 0));
}

function countOccurrences(puzzles, valueForPuzzle) {
  const counts = new Map();
  for (const puzzle of puzzles) {
    for (const value of valueForPuzzle(puzzle)) {
      if (!value) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return counts;
}

function sharesIncident(a, b) {
  const first = new Set(Array.isArray(a?.incidentKeys) ? a.incidentKeys : []);
  return (Array.isArray(b?.incidentKeys) ? b.incidentKeys : []).some((key) => first.has(key));
}

function recentErrorBonus(puzzle, now) {
  const createdAt = Date.parse(puzzle?.createdAt || '');
  if (!Number.isFinite(createdAt)) return 0;
  const ageDays = Math.max(0, (now - createdAt) / 86_400_000);
  return Math.max(0, 10 - (ageDays / 3));
}

function adaptiveScore(puzzle, context) {
  const loss = Math.max(0, Number(puzzle?.loss || 0));
  const attempts = Math.max(0, Number(puzzle?.attempts || 0));
  const cleanSolves = Math.max(0, Number(puzzle?.cleanSolves || 0));
  const friction = Math.max(0, attempts - cleanSolves);
  const incidentFrequency = Math.max(0, ...(puzzle?.incidentKeys || []).map((key) => context.incidentCounts.get(key) || 0));
  const openingFrequency = puzzle?.opening ? (context.openingCounts.get(puzzle.opening) || 0) : 0;

  let score = 0;
  score += Math.min(65, loss / 8);
  score += Math.min(56, friction * 14);
  score += Math.min(36, Math.max(0, incidentFrequency - 1) * 12);
  score += Math.min(15, Math.max(0, openingFrequency - 1) * 5);
  score += recentErrorBonus(puzzle, context.now);
  if (attempts === 0) score += 4;

  if (context.referencePuzzle) {
    if (context.hasIncidentAlternative && sharesIncident(context.referencePuzzle, puzzle)) score -= 18;
    if (context.hasOpeningAlternative && context.referencePuzzle.opening && puzzle.opening === context.referencePuzzle.opening) score -= 6;
  }
  return score;
}

export function rankAdaptivePersonalPuzzles(puzzles = [], { excludeId = null, referencePuzzle = null, now = Date.now() } = {}) {
  const source = Array.isArray(puzzles) ? puzzles.filter(Boolean) : [];
  if (!source.length) return [];
  const reference = referencePuzzle || source.find((puzzle) => puzzle.id === excludeId) || null;
  const withoutExcluded = excludeId ? source.filter((puzzle) => puzzle.id !== excludeId) : source;
  // Conservamos el comportamiento histórico si sólo existe un caso: Siguiente
  // puede mantenerlo en pantalla en vez de devolver un vacío artificial.
  const candidates = withoutExcluded.length ? withoutExcluded : source;
  const incidentCounts = countOccurrences(source, (puzzle) => Array.isArray(puzzle.incidentKeys) ? puzzle.incidentKeys : []);
  const openingCounts = countOccurrences(source, (puzzle) => puzzle.opening ? [puzzle.opening] : []);
  const hasIncidentAlternative = Boolean(reference) && candidates.some((puzzle) => !sharesIncident(reference, puzzle));
  const hasOpeningAlternative = Boolean(reference?.opening) && candidates.some((puzzle) => puzzle.opening !== reference.opening);
  const context = { incidentCounts, openingCounts, referencePuzzle: reference, hasIncidentAlternative, hasOpeningAlternative, now };

  return candidates
    .map((puzzle) => ({ puzzle, score: adaptiveScore(puzzle, context) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const lossDelta = Number(b.puzzle.loss || 0) - Number(a.puzzle.loss || 0);
      if (lossDelta) return lossDelta;
      const dateDelta = Date.parse(b.puzzle.createdAt || 0) - Date.parse(a.puzzle.createdAt || 0);
      if (Number.isFinite(dateDelta) && dateDelta) return dateDelta;
      return String(a.puzzle.id || '').localeCompare(String(b.puzzle.id || ''));
    })
    .map(({ puzzle }) => puzzle);
}

export function focusPersonalPuzzle(id) {
  const clean = typeof id === 'string' ? id.trim() : '';
  if (!clean) {
    removeStorageItem(STORAGE_SESSION, FOCUS_KEY);
    return false;
  }
  setStorageItem(STORAGE_SESSION, FOCUS_KEY, clean);
  return true;
}

function consumeFocusedPersonalPuzzle(excludeId, filter) {
  const focusedId = getStorageItem(STORAGE_SESSION, FOCUS_KEY);
  if (!focusedId) return null;
  removeStorageItem(STORAGE_SESSION, FOCUS_KEY);
  if (focusedId === excludeId) return null;
  const focused = loadPersonalPuzzles().find((puzzle) => puzzle.id === focusedId) || null;
  return focused && matchesPersonalPuzzleFilter(focused, filter) ? focused : null;
}

export function adaptivePersonalPuzzle(excludeId, filter = null, { includeMastered = false, fallbackToMastered = false, now = Date.now() } = {}) {
  const all = loadPersonalPuzzles();
  let eligible = all.filter((puzzle) => matchesPersonalPuzzleFilter(puzzle, filter) && (includeMastered || !isPersonalPuzzleMastered(puzzle)));
  if (!eligible.length && fallbackToMastered) {
    eligible = all.filter((puzzle) => matchesPersonalPuzzleFilter(puzzle, filter) && isPersonalPuzzleMastered(puzzle));
  }
  const referencePuzzle = excludeId ? all.find((puzzle) => puzzle.id === excludeId) || null : null;
  return rankAdaptivePersonalPuzzles(eligible, { excludeId, referencePuzzle, now })[0] || null;
}

// Fachada compatible con llamadas existentes. La cola dejó de ser aleatoria:
// ahora elige el ejercicio con mayor valor de entrenamiento demostrado. Una
// autopsia puede fijar UNA deuda concreta en sessionStorage; se consume una
// sola vez al abrir PuzzleScreen y no contamina el ranking adaptativo normal.
export function randomPersonalPuzzle(excludeId, filter = null, options = {}) {
  const focused = consumeFocusedPersonalPuzzle(excludeId, filter);
  return focused || adaptivePersonalPuzzle(excludeId, filter, options);
}

export function saveGeneratedPersonalPuzzles(puzzles = []) {
  const candidates = (Array.isArray(puzzles) ? puzzles : [])
    .filter((puzzle) => puzzle?.fen && Array.isArray(puzzle?.solution) && puzzle.solution.length > 0)
    .slice(0, 4)
    .map((puzzle) => ({
      ...puzzle,
      id: puzzle.id || stableId(puzzle.fen, puzzle.solution[0]),
      kind: 'personal',
      source: 'workers-ai-validated',
      createdAt: puzzle.createdAt || new Date().toISOString(),
      incidentKeys: Array.isArray(puzzle.incidentKeys) ? puzzle.incidentKeys : [],
    }))
    // Defensa en profundidad: aunque un caller futuro se salte el validador
    // de Workers AI, nunca persistimos una línea/FEN imposible en la cola.
    .filter(isPlayablePersonalPuzzle);
  if (!candidates.length) return { added: 0, total: loadPersonalPuzzles().length, saved: [] };

  const current = loadPersonalPuzzles();
  const byId = new Map(current.map((p) => [p.id, p]));
  let added = 0;
  const saved = [];
  for (const puzzle of candidates) {
    if (!byId.has(puzzle.id)) added += 1;
    const merged = { ...(byId.get(puzzle.id) || {}), ...puzzle };
    byId.set(puzzle.id, merged);
    saved.push(merged);
  }
  const next = [...byId.values()]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, MAX_PUZZLES);
  setProfileStorageItem(KEY, JSON.stringify(next));
  return { added, total: next.length, saved };
}

export function recordPersonalPuzzleResult(id, { solved = false, clean = false, review = false } = {}) {
  if (!id) return null;
  const all = loadPersonalPuzzles();
  const index = all.findIndex((p) => p.id === id);
  if (index < 0) return null;
  const now = new Date().toISOString();
  const previous = all[index];
  const reviewPatch = spacedReviewResultPatch(previous, {
    solved,
    clean,
    review,
    now: Date.parse(now),
  });
  const updated = {
    ...previous,
    attempts: Number(previous.attempts || 0) + 1,
    solves: Number(previous.solves || 0) + (solved ? 1 : 0),
    cleanSolves: Number(previous.cleanSolves || 0) + (solved && clean ? 1 : 0),
    lastAttemptAt: now,
    lastSolvedAt: solved ? now : (previous.lastSolvedAt || null),
    masteredAt: solved ? (previous.masteredAt || now) : (previous.masteredAt || null),
    ...reviewPatch,
  };
  all[index] = updated;
  setProfileStorageItem(KEY, JSON.stringify(all));
  return updated;
}

export function personalTrainingSummary() {
  const all = loadPersonalPuzzles();
  const attempts = all.reduce((sum, p) => sum + Number(p.attempts || 0), 0);
  const solves = all.reduce((sum, p) => sum + Number(p.solves || 0), 0);
  const cleanSolves = all.reduce((sum, p) => sum + Number(p.cleanSolves || 0), 0);
  const mastered = all.filter(isPersonalPuzzleMastered).length;
  const active = Math.max(0, all.length - mastered);
  return { total: all.length, active, mastered, attempts, solves, cleanSolves, cleanRate: attempts ? Math.round((cleanSolves / attempts) * 100) : null };
}
