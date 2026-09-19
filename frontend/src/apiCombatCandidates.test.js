import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';

function ok(body = {}) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('chess-study-auth-token', 'test-token');
  global.fetch = vi.fn(() => ok({}));
});

describe('Combat analyze shortlist transport', () => {
  it('keeps normal analysis legacy-shaped and can request candidates without doctrine', async () => {
    await api.analyzePosition('fen-normal', 50);
    await api.analyzePosition('fen-combat', 70, {}, null, 5);
    await api.analyzePosition('fen-ghost', 70, {}, { capture: 0.8, check: 0.5 });

    const normal = JSON.parse(global.fetch.mock.calls[0][1].body);
    const combat = JSON.parse(global.fetch.mock.calls[1][1].body);
    const ghost = JSON.parse(global.fetch.mock.calls[2][1].body);
    expect(normal.candidateLimit).toBeUndefined();
    expect(combat.candidateLimit).toBe(5);
    expect(combat.ghostStyle).toBeUndefined();
    expect(ghost.candidateLimit).toBe(5);
    expect(ghost.ghostStyle).toEqual({ capture: 0.8, check: 0.5 });
  });
});
