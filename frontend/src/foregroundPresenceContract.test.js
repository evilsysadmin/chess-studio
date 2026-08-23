// STATIC CONTRACT: presencia de primer plano y cadencia deliberadamente gruesa.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('./components/AdminScreen.jsx', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../backend-python/main.py', import.meta.url), 'utf8');
const auth = readFileSync(new URL('./auth.js', import.meta.url), 'utf8');

// Contract de bajo volumen: no convertimos presencia en telemetría de alta frecuencia.
describe('foreground presence contract', () => {
  it('muestrea cada dos minutos y sólo reacciona además a visibilitychange', () => {
    expect(app).toContain('}, 120000);');
    expect(app).toContain("document.addEventListener('visibilitychange', handleVisibility)");
    expect(app).toContain("document.visibilityState === 'visible'");
    expect(app).not.toContain('pointermove');
  });

  it('admin refresca el agregado con la misma cadencia aproximada', () => {
    expect(admin).toContain('const ADMIN_REFRESH_MS = 120000;');
    expect(admin).toContain('foregroundCount');
    expect(admin).toContain('en primer plano');
    expect(admin).toContain('muestreo aprox. cada 2 min');
    expect(admin).toContain('activityFilter');
    expect(admin).toContain('admin-filter-chip');
    expect(admin).toContain('Inactivo');
  });

  it('backend sólo recibe actividad gruesa y booleano de visibilidad', () => {
    expect(backend).toContain('foreground: Optional[bool] = None');
    expect(backend).toContain('_foreground_summary');
    expect(backend).toContain('freshness_seconds: int = 150');
    expect(backend).toContain('presence = "idle"');
  });

  it('reutiliza el heartbeat para guardar la última release sin más telemetría', () => {
    expect(auth).toContain('payload.release = APP_RELEASE');
    expect(backend).toContain('release: Optional[str]');
    expect(backend).toContain('clientRelease');
    expect(admin).toContain('Última release reportada');
  });
});
