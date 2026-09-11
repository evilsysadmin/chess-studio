import { STORAGE_LOCAL, readJsonStorage, setStorageItem } from './safeStorage.js';

export const NARRATIVE_CALL_LEDGER_KEY = 'chess-study-narrative-call-ledger-v1';
const MAX_ROWS = 80;

function cleanText(value, fallback, max = 48) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, max);
}

function cleanSize(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

export function loadNarrativeCallLedger() {
  const rows = readJsonStorage(STORAGE_LOCAL, NARRATIVE_CALL_LEDGER_KEY, { fallback: [] });
  return Array.isArray(rows)
    ? rows.filter((row) => row && typeof row === 'object').slice(-MAX_ROWS)
    : [];
}

export function recordNarrativeCall({
  eventType = 'generic',
  requestKind = 'default',
  provider = 'unavailable',
  inputChars = 0,
  outputChars = 0,
  ok = false,
  at = new Date().toISOString(),
} = {}) {
  const row = {
    at: typeof at === 'string' ? at : new Date(at).toISOString(),
    eventType: cleanText(eventType, 'generic'),
    requestKind: cleanText(requestKind, 'default', 32),
    provider: cleanText(provider, 'unavailable', 24),
    inputChars: cleanSize(inputChars),
    outputChars: cleanSize(outputChars),
    ok: Boolean(ok),
  };
  const next = [...loadNarrativeCallLedger(), row].slice(-MAX_ROWS);
  setStorageItem(STORAGE_LOCAL, NARRATIVE_CALL_LEDGER_KEY, JSON.stringify(next));
  return row;
}

export function clearNarrativeCallLedger() {
  return setStorageItem(STORAGE_LOCAL, NARRATIVE_CALL_LEDGER_KEY, '[]');
}