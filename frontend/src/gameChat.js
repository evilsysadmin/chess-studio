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

export function compactRepeatedCpuBanter(messages) {
  if (!Array.isArray(messages)) return [];
  const seenGeneric = new Set();
  return messages.filter((message) => {
    // Sólo limpiamos brasa genérica sin evento táctico. Dos comentarios de una
    // misma táctica pueden coincidir en texto y siguen siendo hechos distintos.
    if (message?.by !== 'cpu' || message?.event) return true;
    const clean = String(message?.text || '').trim();
    if (!clean) return true;
    if (seenGeneric.has(clean)) return false;
    seenGeneric.add(clean);
    return true;
  });
}

export function loadActiveGameChat(gameId) {
  if (!gameId) return [];
  const saved = safeParse(getStorageItem(STORAGE_LOCAL, ACTIVE_CHAT_KEY));
  if (!saved || saved.gameId !== gameId || !Array.isArray(saved.messages)) return [];
  const messages = compactRepeatedCpuBanter(saved.messages);
  // Migra también transcripts que ya quedaron duplicados antes del fix. Se
  // escribe una sola vez: las cargas siguientes ya tienen la longitud correcta.
  if (messages.length !== saved.messages.length) {
    setStorageItem(STORAGE_LOCAL, ACTIVE_CHAT_KEY, JSON.stringify({ ...saved, messages }));
  }
  return messages;
}

export function isDuplicateActiveGameComment(messages, text) {
  const clean = String(text || '').trim();
  if (!clean || !Array.isArray(messages)) return false;
  return messages.some((message) => message?.by === 'cpu' && String(message?.text || '').trim() === clean);
}

export function appendActiveGameChat(gameId, comment, meta = {}) {
  if (!gameId || !comment) return [];
  const text = typeof comment === 'string' ? comment : comment.text;
  if (!text) return loadActiveGameChat(gameId);

  const current = loadActiveGameChat(gameId);
  // El transcript activo sobrevive a F5/"Continuar partida". GameScreen puede
  // volver a montar sus efectos de apertura al rehidratar, pero Matthias no
  // debe repetir literalmente una brasa que ya consta en esta misma partida.
  if (isDuplicateActiveGameComment(current, text)) return current;

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
