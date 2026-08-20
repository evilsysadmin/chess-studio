import { authHeader } from './auth.js';
import { withRequestId, requestErrorMessage } from './requestId.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const { message, requestId } = requestErrorMessage(res, body);
    const error = new Error(message);
    error.status = res.status;
    error.requestId = requestId;
    throw error;
  }
  return res.json();
}

export const api = {
  createGame(difficulty, color = 'w', handicap = null) {
    return fetch(`${BASE_URL}/games`, {
      method: 'POST',
      headers: withRequestId({ 'Content-Type': 'application/json', ...authHeader() }),
      body: JSON.stringify({ difficulty, color, handicap }),
    }).then(handle);
  },
  getGame(id) {
    return fetch(`${BASE_URL}/games/${id}`, { headers: withRequestId({ ...authHeader() }) }).then(handle);
  },
  getHint(id) {
    return fetch(`${BASE_URL}/games/${id}/hint`, { headers: withRequestId({ ...authHeader() }) }).then(handle);
  },
  undoMove(id) {
    return fetch(`${BASE_URL}/games/${id}/undo`, { method: 'POST', headers: withRequestId({ ...authHeader() }) }).then(handle);
  },
  analyzePosition(fen, level) {
    return fetch(`${BASE_URL}/analyze`, {
      method: 'POST',
      headers: withRequestId({ 'Content-Type': 'application/json', ...authHeader() }),
      body: JSON.stringify({ fen, level }),
    }).then(handle);
  },
  analyzeMove(fen, from, to, promotion, level) {
    return fetch(`${BASE_URL}/analyze-move`, {
      method: 'POST',
      headers: withRequestId({ 'Content-Type': 'application/json', ...authHeader() }),
      body: JSON.stringify({ fen, from, to, promotion, level }),
    }).then(handle);
  },
  playMove(id, from, to, promotion) {
    return fetch(`${BASE_URL}/games/${id}/move`, {
      method: 'POST',
      headers: withRequestId({ 'Content-Type': 'application/json', ...authHeader() }),
      body: JSON.stringify({ from, to, promotion }),
    }).then(handle);
  },
  deleteGame(id) {
    return fetch(`${BASE_URL}/games/${id}`, { method: 'DELETE', headers: withRequestId({ ...authHeader() }) });
  },
  getProfile() {
    return fetch(`${BASE_URL}/profile`, { headers: withRequestId({ ...authHeader() }) }).then(handle);
  },
  saveProfile(data, { keepalive = false, token = undefined } = {}) {
    const auth = token === undefined ? authHeader() : (token ? { Authorization: `Bearer ${token}` } : {});
    return fetch(`${BASE_URL}/profile`, {
      method: 'PUT',
      headers: withRequestId({ 'Content-Type': 'application/json', ...auth }),
      body: JSON.stringify(data),
      keepalive,
    }).then(handle);
  },
};

export const STORAGE_KEY = 'chess-study-active-game';
