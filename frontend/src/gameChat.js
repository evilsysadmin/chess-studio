import { STORAGE_LOCAL, getStorageItem, setStorageItem, removeStorageItem } from './safeStorage.js';
// gameChat.js — Transcript local de los comentarios en vivo de la CPU.
//
// Mientras una partida está activa vive en SESSION_STATE_KEYS: así sobrevive
// a un refresh/"Continuar partida", pero se borra al cambiar de usuario. Al
// terminar, App copia el transcript dentro del registro de Historial, que sí
// forma parte del perfil sincronizado con MongoDB.

const ACTIVE_CHAT_KEY = 'chess-study-active-game-chat';
const MAX_MESSAGES = 120;

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function loadActiveGameChat(gameId) {
  if (!gameId) return [];
  const saved = safeParse(getStorageItem(STORAGE_LOCAL, ACTIVE_CHAT_KEY));
  if (!saved || saved.gameId !== gameId || !Array.isArray(saved.messages)) return [];
  return saved.messages;
}

export function appendActiveGameChat(gameId, comment, meta = {}) {
  if (!gameId || !comment) return [];
  const text = typeof comment === 'string' ? comment : comment.text;
  if (!text) return loadActiveGameChat(gameId);

  const current = loadActiveGameChat(gameId);
  const message = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    by: 'cpu',
    text: String(text),
    event: meta.event || (typeof comment === 'object' ? comment.event?.type : null) || null,
    actor: meta.actor || null,
    ply: Number.isFinite(meta.ply) ? meta.ply : null,
  };

  const messages = [...current, message].slice(-MAX_MESSAGES);
  setStorageItem(STORAGE_LOCAL, ACTIVE_CHAT_KEY, JSON.stringify({ gameId, messages }));
  return messages;
}

export function clearActiveGameChat(gameId = null) {
  if (!gameId) {
    removeStorageItem(STORAGE_LOCAL, ACTIVE_CHAT_KEY);
    return;
  }
  const saved = safeParse(getStorageItem(STORAGE_LOCAL, ACTIVE_CHAT_KEY));
  if (!saved || saved.gameId === gameId) removeStorageItem(STORAGE_LOCAL, ACTIVE_CHAT_KEY);
}
