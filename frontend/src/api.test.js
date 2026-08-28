import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';

function ok(body = {}) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

function gamePayload(id = 'g1') {
  return {
    id,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    turn: 'w', humanColor: 'w', difficulty: 50, status: 'playing', isGameOver: false,
    history: [], lastMove: null,
  };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('chess-study-auth-token', 'token-de-prueba');
  global.fetch = vi.fn(() => ok(gamePayload()));
});

describe('trazabilidad de usuario en llamadas de juego', () => {
  it('manda Authorization al crear una partida', async () => {
    await api.createGame(50, 'w');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/games'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-de-prueba' }),
      }),
    );
  });

  it('serializa el estilo del Rival Fantasma sólo al crear la partida', async () => {
    const ghostStyle = { capture: 0.4, pawn: -0.2, queen: 0.1, check: 0.5, castle: -0.3 };
    await api.createGame(62, 'b', null, null, ghostStyle);
    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.ghostStyle).toEqual(ghostStyle);
    expect(body.difficulty).toBe(62);
    expect(body.color).toBe('b');
  });

  it('manda Authorization al analizar y mover', async () => {
    await api.analyzePosition('fen', 50);
    await api.playMove('g1', 'e2', 'e4');

    for (const [, options] of global.fetch.mock.calls) {
      expect(options.headers.Authorization).toBe('Bearer token-de-prueba');
    }
  });


  it('manda un X-Request-ID distinto en cada request', async () => {
    await api.getGame('g1');
    await api.getHint('g1');
    const first = global.fetch.mock.calls[0][1].headers['X-Request-ID'];
    const second = global.fetch.mock.calls[1][1].headers['X-Request-ID'];
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it('consulta feature flags con la sesión autenticada', async () => {
    await api.getFeatures();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/features');
    expect(options.headers.Authorization).toBe('Bearer token-de-prueba');
  });

  it('manda Authorization también en GET y DELETE de partida', async () => {
    await api.getGame('g1');
    await api.getHint('g1');
    await api.undoMove('g1');
    await api.deleteGame('g1');

    for (const [, options] of global.fetch.mock.calls) {
      expect(options.headers.Authorization).toBe('Bearer token-de-prueba');
    }
  });

  it('rechaza un 200 con partida malformada antes de entregarlo a la UI', async () => {
    global.fetch.mockImplementationOnce(() => ok({ id: 'g1', fen: 'fen-roto' }));
    await expect(api.getGame('g1')).rejects.toMatchObject({ name: 'GamePayloadError' });
  });
});
