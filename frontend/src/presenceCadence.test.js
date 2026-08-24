import { describe, expect, it } from 'vitest';
import { ADMIN_REFRESH_MS, PRESENCE_HEARTBEAT_MS } from './presenceCadence.js';

describe('presence cadence', () => {
  it('mantiene presencia y refresco admin deliberadamente gruesos y alineados', () => {
    expect(PRESENCE_HEARTBEAT_MS).toBe(120000);
    expect(ADMIN_REFRESH_MS).toBe(PRESENCE_HEARTBEAT_MS);
  });
});
