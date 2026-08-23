import { Chess } from 'chess.js';
import { setProfileStorageItem } from './profileKeys.js';

const KEY = 'chess-study-personal-puzzles';
const MAX_PUZZLES = 40;

export function loadPersonalPuzzles() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  for (const puzzle of candidates) {
    if (!byId.has(puzzle.id)) added += 1;
    byId.set(puzzle.id, puzzle);
  }
  const next = [...byId.values()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, MAX_PUZZLES);
  if (added) setProfileStorageItem(KEY, JSON.stringify(next));
  return { added, total: next.length };
}

export function personalPuzzlesForFilter(filter = null) {
  const all = loadPersonalPuzzles();
  if (!filter?.opening) return all;
  return all.filter((p) => p.opening === filter.opening);
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

