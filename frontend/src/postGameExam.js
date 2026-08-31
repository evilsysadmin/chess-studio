import { getUsername } from './auth.js';
import { loadPersonalPuzzles } from './personalPuzzles.js';
import { STORAGE_SESSION, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';

export const POST_GAME_EXAM_KEY = 'chess-study-post-game-exam-v1';
const SCHEMA = 1;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

function owner() {
  return String(getUsername() || '').trim().toLowerCase() || null;
}

function uniqueIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '')).filter(Boolean))].slice(0, 3);
}

export function postGameExamCandidateIds(report, meta = {}, puzzles = loadPersonalPuzzles()) {
  const gameId = String(meta?.gameId || '');
  if (!gameId) return [];
  const critical = (Array.isArray(report?.topMistakes) ? report.topMistakes : [])
    .filter((move) => Number(move?.loss || 0) >= 80)
    .slice(0, 3);
  if (!critical.length) return [];
  const source = (Array.isArray(puzzles) ? puzzles : []).filter((puzzle) => (
    puzzle?.source === 'autopsy' && String(puzzle?.sourceGameId || '') === gameId
  ));
  const ids = [];
  for (const move of critical) {
    const match = source.find((puzzle) => (
      (move.moveNumber != null && Number(puzzle?.moveNumber) === Number(move.moveNumber))
      || (move.suggested && puzzle?.suggested === move.suggested)
    ));
    if (match?.id && !ids.includes(match.id)) ids.push(match.id);
  }
  return ids.slice(0, 3);
}

export function startPostGameExam(ids, { gameId = null, now = Date.now() } = {}) {
  const puzzleIds = uniqueIds(ids);
  if (puzzleIds.length < 2) return null;
  const startedAt = Number(now);
  const session = {
    schema: SCHEMA,
    owner: owner(),
    sourceGameId: gameId ? String(gameId) : null,
    startedAt,
    puzzleIds,
  };
  setStorageItem(STORAGE_SESSION, POST_GAME_EXAM_KEY, JSON.stringify(session));
  return session;
}

function normalizeExam(raw, now) {
  if (!raw || raw.schema !== SCHEMA || raw.owner !== owner()) return null;
  const startedAt = Number(raw.startedAt || 0);
  if (!startedAt || now - startedAt > MAX_AGE_MS || startedAt - now > 60_000) return null;
  const puzzleIds = uniqueIds(raw.puzzleIds);
  if (puzzleIds.length < 2) return null;
  return {
    schema: SCHEMA,
    owner: raw.owner || null,
    sourceGameId: raw.sourceGameId ? String(raw.sourceGameId) : null,
    startedAt,
    puzzleIds,
  };
}

export function loadPostGameExam({ now = Date.now() } = {}) {
  try {
    const parsed = JSON.parse(getStorageItem(STORAGE_SESSION, POST_GAME_EXAM_KEY) || 'null');
    const exam = normalizeExam(parsed, Number(now));
    if (!exam) removeStorageItem(STORAGE_SESSION, POST_GAME_EXAM_KEY);
    return exam;
  } catch {
    removeStorageItem(STORAGE_SESSION, POST_GAME_EXAM_KEY);
    return null;
  }
}

export function postGameExamPuzzles(exam = loadPostGameExam(), puzzles = loadPersonalPuzzles()) {
  if (!exam?.puzzleIds?.length) return [];
  const byId = new Map((Array.isArray(puzzles) ? puzzles : []).map((puzzle) => [String(puzzle?.id || ''), puzzle]));
  const rows = exam.puzzleIds.map((id) => byId.get(String(id))).filter(Boolean).slice(0, 3);
  return rows.length >= 2 ? rows : [];
}

export function clearPostGameExam() {
  removeStorageItem(STORAGE_SESSION, POST_GAME_EXAM_KEY);
}
