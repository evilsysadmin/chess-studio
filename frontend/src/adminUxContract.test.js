// STATIC CONTRACT: protege wiring/markup del panel Admin; no sustituye tests de interacción.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const admin = readFileSync(new URL('./components/AdminScreen.jsx', import.meta.url), 'utf8');
const formatting = readFileSync(new URL('./adminFormatting.js', import.meta.url), 'utf8');

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

  it('muestra observabilidad del narrador AI sólo dentro de Admin', () => {
    expect(admin).toContain("import AiNarrativeMetrics from './AiNarrativeMetrics.jsx';");
    expect(admin).toContain('<AiNarrativeMetrics token={getToken()} />');
  });
});
