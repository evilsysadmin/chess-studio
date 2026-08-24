// STATIC CONTRACT: protege wiring/markup del panel Admin; no sustituye tests de interacción.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const admin = readFileSync(new URL('./components/AdminScreen.jsx', import.meta.url), 'utf8');
const formatting = readFileSync(new URL('./adminFormatting.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
const liveStatus = readFileSync(new URL('./components/LiveServiceStatus.jsx', import.meta.url), 'utf8');
const menu = readFileSync(new URL('./components/Menu.jsx', import.meta.url), 'utf8');
const observability = readFileSync(new URL('./components/ObservabilityPanel.jsx', import.meta.url), 'utf8');

describe('admin UX contract', () => {
  it('abre el expediente desde el propio nombre y elimina el botón redundante', () => {
    expect(admin).toContain('className={`admin-user-link${isOpen');
    expect(admin).toContain('aria-expanded={isOpen}');
    expect(admin).toContain('setExpanded(isOpen ? null : u.username)');
    expect(admin).not.toContain('Ver detalles');
    expect(admin).not.toContain('admin-peek-button');
  });

  it('usa timestamps españoles de 24 horas de forma centralizada', () => {
    expect(admin).toContain('formatAdminTimestamp');
    expect(formatting).toContain("'es-ES'");
    expect(formatting).toContain('hour12: false');
    expect(admin).not.toContain('.toLocaleString()');
  });

  it('muestra observabilidad global de Chess Studio sólo dentro de Admin', () => {
    expect(admin).toContain("import ObservabilityPanel from './ObservabilityPanel.jsx';");
    expect(admin).toContain('<ObservabilityPanel token={getToken()} users={users || []} currentAdmin={currentAdmin} />');
  });

  it('mantiene observabilidad simple por defecto y profundidad bajo clic', () => {
    expect(observability).toContain('Estado de Chess Studio');
    expect(observability).toContain('Ver métricas completas');
    expect(observability).toContain('OBSERVABILITY_REFRESH_MS = 120000');
    expect(observability).toContain('Sin jugadas, FEN, mensajes, clicks ni identidad sensible.');
    expect(observability).toContain('Workers AI');
    expect(observability.match(/Latencias p50 \/ p95 \/ p99/g)?.length).toBe(2);
  });
  it('muestra presencia en primer plano sin confundirla con online', () => {
    expect(admin).toContain('foregroundCount');
    expect(admin).toContain('Primer plano');
    expect(admin).toContain('Segundo plano');
  });

  it('filtra actividad y muestra la última release reportada por usuario', () => {
    expect(admin).toContain('ADMIN_USER_FILTERS');
    expect(admin).toContain('admin-filter-chip');
    expect(admin).toContain('<th>Versión</th>');
    expect(admin).toContain('clientRelease');
    expect(admin).toContain('Última release reportada');
  });

  it('blinda Usuarios online → Panel admin sólo para admins', () => {
    expect(app).toContain("<GlobalMusicDock isAdminUser={isAdminUser} onAdmin={() => navigateTo('admin')}");
    expect(liveStatus).toContain("const canOpenAdmin = isAdminUser && typeof onAdmin === 'function';");
    expect(liveStatus).toContain('className="live-service-online-link"');
    expect(liveStatus).toContain('onClick={onAdmin}');
  });

  it('ofrece feedback visible en Home y lo muestra en Admin', () => {
    expect(menu).toContain('className="home-feedback-button"');
    expect(menu).toContain('<FeedbackModal context="Home"');
    expect(admin).toContain('aria-label="Feedback de usuarios"');
    expect(admin).toContain('fetchAdminFeedback');
    expect(admin).toContain("handleFeedbackStatus(item.id, 'resolved')");
    expect(admin).toContain("const resolvedFeedback = (feedback || []).filter((item) => item.status === 'resolved');");
    expect(admin).toContain('<summary>Resueltos ({resolvedFeedback.length})</summary>');
    expect(admin).toContain('activeFeedback.map(renderFeedbackItem)');
  });

});
