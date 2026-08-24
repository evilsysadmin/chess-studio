// STATIC CONTRACT: privacidad/cadencia gruesa de presencia; la lógica pura se prueba aparte.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const presenceHook = readFileSync(new URL('./usePresenceHeartbeat.js', import.meta.url), 'utf8');

describe('foreground presence contract', () => {
  it('no convierte presencia en telemetría de interacción de alta frecuencia', () => {
    expect(presenceHook).toContain('PRESENCE_HEARTBEAT_MS');
    expect(presenceHook).toContain("document.addEventListener('visibilitychange', handleVisibility)");
    expect(presenceHook).not.toMatch(/pointermove|mousemove|keydown|click/);
  });

});
