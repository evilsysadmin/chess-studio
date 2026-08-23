// STATIC CONTRACT: inspecciona wiring/markup/CSS deliberadamente; no sustituye tests de comportamiento.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const adminSource = readFileSync(new URL('./components/AdminScreen.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

describe('admin mobile layout contract', () => {
  it('expone etiquetas semánticas para convertir cada fila en ficha móvil', () => {
    for (const label of ['Usuario', 'Actividad', 'Rating', 'Partidas', 'V/T/D', 'Peor', 'Versión', 'Acciones']) {
      expect(adminSource).toContain(`data-label="${label}"`);
    }
  });

  it('activa el layout de fichas y desactiva la columna sticky en móvil', () => {
    const mobileBlock = cssSource.slice(cssSource.indexOf('/* ---------- V16.6am · admin móvil legible ----------'));
    expect(mobileBlock).toContain('@media (max-width: 700px)');
    expect(mobileBlock).toContain('.admin-users-table tbody > tr:not(.admin-detail-row)');
    expect(mobileBlock).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(mobileBlock).toContain('position: static;');
    expect(mobileBlock).toContain('.admin-user-actions');
  });
});
