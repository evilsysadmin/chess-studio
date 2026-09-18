import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pvpApi } from './pvpApi.js';

function ok(body = {}) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('chess-study-auth-token', 'pvp-token');
  global.fetch = vi.fn(() => ok({}));
});

describe('War Room 1v1 API', () => {
  it('autentica lobby, roster y retos', async () => {
    await pvpApi.getLobby();
    await pvpApi.joinRoster();
    await pvpApi.challenge('bob');

    for (const [, options] of global.fetch.mock.calls) {
      expect(options.headers.Authorization).toBe('Bearer pvp-token');
    }
    expect(global.fetch.mock.calls[0][0]).toContain('/pvp/lobby');
    expect(global.fetch.mock.calls[1][0]).toContain('/pvp/roster');
    expect(JSON.parse(global.fetch.mock.calls[2][1].body)).toEqual({ opponent: 'bob' });
  });

  it('usa endpoints explícitos de cancelar, aceptar y rechazar reto', async () => {
    await pvpApi.cancelChallenge('c-0');
    await pvpApi.acceptChallenge('c-1');
    await pvpApi.declineChallenge('c-2');

    expect(global.fetch.mock.calls[0][0]).toContain('/pvp/challenges/c-0/cancel');
    expect(global.fetch.mock.calls[0][1].method).toBe('POST');
    expect(global.fetch.mock.calls[1][0]).toContain('/pvp/challenges/c-1/accept');
    expect(global.fetch.mock.calls[1][1].method).toBe('POST');
    expect(global.fetch.mock.calls[2][0]).toContain('/pvp/challenges/c-2/decline');
  });

  it('serializa una jugada humana con promoción opcional', async () => {
    await pvpApi.playMove('m-1', 'e7', 'e8', 'q');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/pvp/matches/m-1/move');
    expect(JSON.parse(options.body)).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
  });

  it('registra una rendición 1v1 con endpoint explícito', async () => {
    await pvpApi.resignMatch('m-9');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/pvp/matches/m-9/resign');
    expect(options.method).toBe('POST');
  });

  it('sale del roster con DELETE autenticado', async () => {
    global.fetch.mockImplementationOnce(() => Promise.resolve({ ok: true, status: 204 }));
    await pvpApi.leaveRoster();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/pvp/roster');
    expect(options.method).toBe('DELETE');
    expect(options.headers.Authorization).toBe('Bearer pvp-token');
  });
});
