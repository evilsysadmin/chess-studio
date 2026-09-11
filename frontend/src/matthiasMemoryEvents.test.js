import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from './auth.js';
import { askMatthiasDaily, resetOwnMatthiasMemory } from './matthiasDaily.js';
import { MATTHIAS_MEMORY_UPDATED_EVENT, emitMatthiasMemoryUpdated } from './matthiasMemoryEvents.js';

const USERNAME_KEY = 'chess-study-auth-username';
const originalDispatchEvent = globalThis.dispatchEvent;
const originalCustomEvent = globalThis.CustomEvent;

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

function response(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(TOKEN_KEY, 'player-token');
  localStorage.setItem(USERNAME_KEY, 'player');
  globalThis.CustomEvent = FakeCustomEvent;
  globalThis.dispatchEvent = vi.fn(() => true);
  global.fetch = vi.fn();
});

afterEach(() => {
  globalThis.dispatchEvent = originalDispatchEvent;
  globalThis.CustomEvent = originalCustomEvent;
  vi.restoreAllMocks();
});

describe('Matthias memory update events', () => {
  it('dispatches only the supplied memory as event detail', () => {
    const memory = { consultations: 4, respect: { label: 'Conocido' } };
    expect(emitMatthiasMemoryUpdated(memory)).toBe(true);
    const event = globalThis.dispatchEvent.mock.calls[0][0];
    expect(event.type).toBe(MATTHIAS_MEMORY_UPDATED_EVENT);
    expect(event.detail).toBe(memory);
  });

  it('broadcasts confirmed daily memory and clears it after a successful reset', async () => {
    const memory = { consultations: 5, activeGoals: [{ id: 'g1', label: 'No regalar damas' }] };
    global.fetch
      .mockResolvedValueOnce(response({ used: true, provider: 'cloudflare', text: 'Bien.', memory }))
      .mockResolvedValueOnce(response({ reset: true }));

    await askMatthiasDaily('tactics', { total_games: 12 }, { id: 'memory-event' });
    await resetOwnMatthiasMemory();

    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(2);
    expect(globalThis.dispatchEvent.mock.calls[0][0].detail).toBe(memory);
    expect(globalThis.dispatchEvent.mock.calls[1][0].detail).toBeNull();
  });
});
