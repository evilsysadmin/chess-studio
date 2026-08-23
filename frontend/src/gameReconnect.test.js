import { describe, expect, it, vi } from 'vitest';
import { fetchReconnectGame, reconnectTarget } from './gameReconnect.js';

describe('auto reconnect de partida activa', () => {
  it('elige sólo una partida que esté realmente abierta', () => {
    expect(reconnectTarget({ route: 'game', game: { id: 'g-1' } })).toEqual({ route: 'game', gameId: 'g-1' });
    expect(reconnectTarget({ route: 'tournamentGame', tournamentGame: { id: 't-1' } })).toEqual({ route: 'tournamentGame', gameId: 't-1' });
    expect(reconnectTarget({ route: 'menu', game: { id: 'g-1' } })).toBeNull();
  });

  it('puede usar el snapshot si la UI aún no rehidrató el objeto de partida', () => {
    expect(reconnectTarget({
      route: 'game',
      savedSession: { route: 'game', gameId: 'g-saved' },
    })).toEqual({ route: 'game', gameId: 'g-saved' });
    expect(reconnectTarget({
      route: 'tournamentGame',
      savedSession: { route: 'tournamentGame', gameId: 't-saved' },
    })).toEqual({ route: 'tournamentGame', gameId: 't-saved' });
  });

  it('acepta la copia autoritativa del backend sólo si corresponde al mismo gameId', async () => {
    const getGame = vi.fn().mockResolvedValue({ id: 'g-7', fen: 'server-fen' });
    await expect(fetchReconnectGame('g-7', getGame)).resolves.toMatchObject({
      ok: true,
      reason: 'recovered',
      game: { id: 'g-7', fen: 'server-fen' },
    });
    expect(getGame).toHaveBeenCalledWith('g-7');

    await expect(fetchReconnectGame('g-7', vi.fn().mockResolvedValue({ id: 'otro' }))).resolves.toMatchObject({
      ok: false,
      reason: 'invalid-response',
    });
  });

  it('devuelve un fallo recuperable sin destruir la sesión local', async () => {
    const error = Object.assign(new Error('backend aún caído'), { status: 503 });
    await expect(fetchReconnectGame('g-9', vi.fn().mockRejectedValue(error))).resolves.toMatchObject({
      ok: false,
      reason: 'request-failed',
      error,
    });
  });
});
