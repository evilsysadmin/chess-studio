import { authHeader } from './auth.js';
import { request, requestJson } from './http.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function jsonRequest(path, { method = 'GET', body = null, signal } = {}) {
  return requestJson(`${BASE_URL}/pvp${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeader(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });
}

export const pvpApi = {
  getLobby({ signal } = {}) {
    return jsonRequest('/lobby', { signal });
  },

  joinRoster({ signal } = {}) {
    return jsonRequest('/roster', { method: 'POST', signal });
  },

  leaveRoster({ signal } = {}) {
    return request(`${BASE_URL}/pvp/roster`, {
      method: 'DELETE',
      headers: { ...authHeader() },
      signal,
    });
  },

  challenge(opponent, { signal } = {}) {
    return jsonRequest('/challenges', {
      method: 'POST',
      body: { opponent },
      signal,
    });
  },

  acceptChallenge(challengeId, { signal } = {}) {
    return jsonRequest(`/challenges/${challengeId}/accept`, { method: 'POST', signal });
  },

  declineChallenge(challengeId, { signal } = {}) {
    return jsonRequest(`/challenges/${challengeId}/decline`, { method: 'POST', signal });
  },

  getMatch(matchId, { signal } = {}) {
    return jsonRequest(`/matches/${matchId}`, { signal });
  },

  playMove(matchId, from, to, promotion = null, { signal } = {}) {
    return jsonRequest(`/matches/${matchId}/move`, {
      method: 'POST',
      body: { from, to, promotion },
      signal,
    });
  },

  resignMatch(matchId, { signal } = {}) {
    return jsonRequest(`/matches/${matchId}/resign`, { method: 'POST', signal });
  },
};
