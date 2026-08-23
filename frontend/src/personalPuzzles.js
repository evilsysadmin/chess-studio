import { Chess } from 'chess.js';
import { setProfileStorageItem } from './profileKeys.js';
import { detectNoteworthyMove } from './cpuCommentary.js';

const KEY = 'chess-study-personal-puzzles';
const MAX_PUZZLES = 40;

export function loadPersonalPuzzles() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeStoredPuzzle) : [];
  } catch {
    return [];
  }
}


function normalizeStoredPuzzle(puzzle) {
  if (!puzzle || typeof puzzle !== 'object' || Array.isArray(puzzle.incidentKeys)) return puzzle;
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

function detectIncidentKeys(fenBefore, moveReport) {
  const keys = [];
  const played = moveReport?.playedFrom && moveReport?.playedTo
    ? { from: moveReport.playedFrom, to: moveReport.playedTo }
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

export function puzzleFromMistake(history, humanColor, moveReport, meta = {}) {
  if (!moveReport || !Array.isArray(history) || !moveReport.suggested || moveReport.loss < 80) return null;
  if (moveReport.played && moveReport.suggested === moveReport.played) return null;
  const chess = new Chess();
  try {
    for (let i = 0; i < moveReport.index; i++) chess.move(history[i].san);
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
    .map((m) => puzzleFromMistake(history, humanColor, m, meta))
    .filter(Boolean);
  if (!candidates.length) return { added: 0, total: loadPersonalPuzzles().length };

  const current = loadPersonalPuzzles();
  const byId = new Map(current.map((p) => [p.id, p]));
  let added = 0;
  let changed = false;
  for (const puzzle of candidates) {
    const previous = byId.get(puzzle.id);
    if (!previous) added += 1;
    if (!previous || JSON.stringify(previous) !== JSON.stringify(puzzle)) changed = true;
    byId.set(puzzle.id, puzzle);
  }
  const next = [...byId.values()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, MAX_PUZZLES);
  if (changed) setProfileStorageItem(KEY, JSON.stringify(next));
  return { added, total: next.length };
}

export function personalPuzzlesForFilter(filter = null) {
  return loadPersonalPuzzles().filter((p) => matchesPersonalPuzzleFilter(p, filter));
}


export function randomPersonalPuzzle(excludeId, filter = null) {
  const eligible = personalPuzzlesForFilter(filter);
  const pool = excludeId ? eligible.filter((p) => p.id !== excludeId) : eligible;
  const list = pool.length ? pool : eligible;
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

export function recordPersonalPuzzleResult(id, { solved = false, clean = false } = {}) {
  if (!id) return null;
  const all = loadPersonalPuzzles();
  const index = all.findIndex((p) => p.id === id);
  if (index < 0) return null;
  const now = new Date().toISOString();
  const previous = all[index];
  const updated = {
    ...previous,
    attempts: Number(previous.attempts || 0) + 1,
    solves: Number(previous.solves || 0) + (solved ? 1 : 0),
    cleanSolves: Number(previous.cleanSolves || 0) + (solved && clean ? 1 : 0),
    lastAttemptAt: now,
    lastSolvedAt: solved ? now : (previous.lastSolvedAt || null),
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
  return { total: all.length, attempts, solves, cleanSolves, cleanRate: attempts ? Math.round((cleanSolves / attempts) * 100) : null };
}

