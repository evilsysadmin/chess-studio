import { describe, expect, it, vi } from 'vitest';
import { requestWarRoomLandscape } from './useWarRoomLandscape.js';

describe('War Room landscape request', () => {
  it('bloquea directamente en landscape cuando el navegador lo permite', async () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    const result = await requestWarRoomLandscape({
      screenObject:{ orientation:{ lock } },
      documentObject:{},
    });

    expect(result).toBe('locked');
    expect(lock).toHaveBeenCalledWith('landscape');
  });

  it('entra en fullscreen desde el gesto de usuario antes de reintentar el lock', async () => {
    const order = [];
    const requestFullscreen = vi.fn().mockImplementation(async () => { order.push('fullscreen'); });
    const lock = vi.fn().mockImplementation(async () => { order.push('lock'); });
    const result = await requestWarRoomLandscape({
      screenObject:{ orientation:{ lock } },
      documentObject:{ documentElement:{ requestFullscreen } },
      requestFullscreen:true,
    });

    expect(result).toBe('locked');
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI:'hide' });
    expect(order).toEqual(['fullscreen', 'lock']);
  });

  it('degrada sin romper la partida si el navegador no expone o rechaza el lock', async () => {
    await expect(requestWarRoomLandscape({ screenObject:{} })).resolves.toBe('unsupported');
    await expect(requestWarRoomLandscape({
      screenObject:{ orientation:{ lock:vi.fn().mockRejectedValue(new Error('not allowed')) } },
    })).resolves.toBe('rejected');
  });
});
