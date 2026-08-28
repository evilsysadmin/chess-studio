import { describe, expect, it } from 'vitest';
import { ADMIN_REFRESH_MS, PRESENCE_HEARTBEAT_MS } from './presenceCadence.js';

describe('presence cadence', () => {
  it('mantiene heartbeat grueso pero deja que Admin relea presencia con más frecuencia', () => {
    expect(PRESENCE_HEARTBEAT_MS).toBe(120000);
    expect(ADMIN_REFRESH_MS).toBe(30000);
    expect(ADMIN_REFRESH_MS).toBeLessThan(PRESENCE_HEARTBEAT_MS);
  });
});
