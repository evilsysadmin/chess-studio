import { authHeader } from './auth.js';
import { request, requestJson } from './http.js';
import { requireGamePayload } from './gamePayload.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';


export const api = {
  getFeatures() {
    return requestJson(`${BASE_URL}/features`, { headers: { ...authHeader() } });
  },
  createGame(difficulty, color = 'w', handicap = null, startingFen = null, ghostStyle = null, { signal } = {}) {
    return requestJson(`${BASE_URL}/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ difficulty, color, handicap, startingFen, ghostStyle }),
      signal,
    }).then((payload) => requireGamePayload(payload));
  },
  getGame(id, { signal } = {}) {
    return requestJson(`${BASE_URL}/games/${id}`, { headers: { ...authHeader() }, signal })
      .then((payload) => requireGamePayload(payload, id));
  },
  getHint(id, { signal } = {}) {
    return requestJson(`${BASE_URL}/games/${id}/hint`, { headers: { ...authHeader() }, signal });
  },
  undoMove(id, { signal } = {}) {
    return requestJson(`${BASE_URL}/games/${id}/undo`, { method: 'POST', headers: { ...authHeader() }, signal })
      .then((payload) => requireGamePayload(payload, id));
  },
  analyzePosition(fen, level, { signal } = {}) {
    return requestJson(`${BASE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ fen, level }),
      timeoutMs: 8000,
      signal,
    });
  },
  analyzeMove(fen, from, to, promotion, level, { signal } = {}) {
    return requestJson(`${BASE_URL}/analyze-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ fen, from, to, promotion, level }),
      timeoutMs: 8000,
      signal,
    });
  },
  playMove(id, from, to, promotion, { signal } = {}) {
    return requestJson(`${BASE_URL}/games/${id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ from, to, promotion }),
      signal,
    }).then((payload) => requireGamePayload(payload, id));
  },
  deleteGame(id) {
    return request(`${BASE_URL}/games/${id}`, { method: 'DELETE', headers: { ...authHeader() } });
  },
  getProfile({ token = undefined } = {}) {
    const auth = token === undefined ? authHeader() : (token ? { Authorization: `Bearer ${token}` } : {});
    return requestJson(`${BASE_URL}/profile`, { headers: { ...auth } });
  },
  saveProfile(data, { keepalive = false, token = undefined } = {}) {
    const auth = token === undefined ? authHeader() : (token ? { Authorization: `Bearer ${token}` } : {});
    return requestJson(`${BASE_URL}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify(data),
      keepalive,
    });
  },
  patchProfile(data, revisions, { keepalive = false, token = undefined } = {}) {
    const auth = token === undefined ? authHeader() : (token ? { Authorization: `Bearer ${token}` } : {});
    return requestJson(`${BASE_URL}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ data, revisions }),
      keepalive,
    });
  },
};

export const STORAGE_KEY = 'chess-study-active-game';
