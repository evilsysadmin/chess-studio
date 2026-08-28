import { describe, expect, it, vi } from 'vitest';
import { runProgressResetLifecycle } from './progressResetLifecycle.js';

describe('progress reset lifecycle', () => {
  it('resetea perfil y luego memoria de Matthias antes de confirmar éxito', async () => {
    const order = [];
    const result = await runProgressResetLifecycle({
      snapshot: { old: true },
      resetLocal: () => order.push('local-reset'),
      saveProfile: async () => order.push('profile-saved'),
      resetMatthias: async () => order.push('matthias-forgot'),
      restoreLocal: () => order.push('restored'),
    });
    expect(result).toEqual({ reset: true });
    expect(order).toEqual(['local-reset', 'profile-saved', 'matthias-forgot']);
  });

  it('si Matthias no puede olvidar, restaura el perfil y no finge éxito', async () => {
    const restoreLocal = vi.fn();
    let saves = 0;
    await expect(runProgressResetLifecycle({
      snapshot: { rating: 1400 },
      resetLocal: vi.fn(),
      saveProfile: async () => { saves += 1; },
      resetMatthias: async () => { throw new Error('mongo unavailable'); },
      restoreLocal,
    })).rejects.toThrow('mongo unavailable');
    expect(restoreLocal).toHaveBeenCalledWith({ rating: 1400 });
    expect(saves).toBe(2); // reset attempt + rollback persistence
  });
});
