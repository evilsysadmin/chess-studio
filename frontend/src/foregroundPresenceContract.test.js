// STATIC CONTRACT: privacidad/cadencia gruesa de presencia; la lógica pura se prueba aparte.
// La responsabilidad está dividida a propósito:
// - usePresenceHeartbeat: puente React -> lifecycle
// - presenceLifecycle: cadencia + ciclo visibility/pagehide/pageshow
// - auth: transporte keepalive de salida
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const presenceHook = readFileSync(new URL('./usePresenceHeartbeat.js', import.meta.url), 'utf8');
const presenceLifecycle = readFileSync(new URL('./presenceLifecycle.js', import.meta.url), 'utf8');
const presenceCadence = readFileSync(new URL('./presenceCadence.js', import.meta.url), 'utf8');
const auth = readFileSync(new URL('./auth.js', import.meta.url), 'utf8');

describe('foreground presence contract', () => {
  it('mantiene presencia gruesa sin telemetría de interacción de alta frecuencia', () => {
    // El hook React debe limitarse a delegar en el lifecycle dueño del contrato.
    expect(presenceHook).toContain("import { bindPresenceLifecycle } from './presenceLifecycle.js'");
    expect(presenceHook).toContain('bindPresenceLifecycle(coarseActivity)');

    // La cadencia sigue siendo deliberadamente gruesa: 2 minutos.
    expect(presenceLifecycle).toContain('PRESENCE_HEARTBEAT_MS');
    expect(presenceCadence).toContain('PRESENCE_HEARTBEAT_MS = 120000');

    // La presencia sólo reacciona a visibilidad/ciclo de página, no a clicks/teclas/puntero.
    expect(presenceLifecycle).toContain("doc.addEventListener?.('visibilitychange', onVisibility)");
    expect(presenceLifecycle).toContain("win.addEventListener?.('pagehide', onPageHide)");
    expect(presenceLifecycle).toContain("win.addEventListener?.('pageshow', onPageShow)");
    expect(`${presenceHook}\n${presenceLifecycle}`).not.toMatch(/pointermove|mousemove|keydown|click/);

    // El cierre de página/logout sigue usando transporte keepalive best-effort.
    expect(auth).toContain('keepalive: true');
    expect(presenceLifecycle).toContain('reportPageLeavePresence');
  });
});
