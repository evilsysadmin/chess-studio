// STATIC CONTRACT: presencia de primer plano y cadencia deliberadamente gruesa.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
const presenceHook = readFileSync(new URL('./usePresenceHeartbeat.js', import.meta.url), 'utf8');
const admin = readFileSync(new URL('./components/AdminScreen.jsx', import.meta.url), 'utf8');
const auth = readFileSync(new URL('./auth.js', import.meta.url), 'utf8');

// Contract de bajo volumen: no convertimos presencia en telemetría de alta frecuencia.
describe('foreground presence contract', () => {
  it('muestrea cada dos minutos y sólo reacciona además a visibilitychange', () => {
    expect(app).toContain('usePresenceHeartbeat(view)');
    expect(presenceHook).toContain('PRESENCE_HEARTBEAT_MS');
    expect(presenceHook).toContain("document.addEventListener('visibilitychange', handleVisibility)");
    expect(presenceHook).toContain("document.visibilityState === 'visible'");
    expect(presenceHook).not.toContain('pointermove');
  });

  it('admin refresca el agregado con la misma cadencia aproximada', () => {
    expect(admin).toContain('ADMIN_REFRESH_MS');
    expect(admin).toContain('foregroundCount');
    expect(admin).toContain('en primer plano');
    expect(admin).toContain('muestreo aprox. cada 2 min');
    expect(admin).toContain('activityFilter');
    expect(admin).toContain('admin-filter-chip');
    expect(admin).toContain('Inactivo');
  });


  it('reutiliza el heartbeat para guardar la última release sin más telemetría', () => {
    expect(auth).toContain('payload.release = APP_RELEASE');
    expect(admin).toContain('Última release reportada');
  });
});
