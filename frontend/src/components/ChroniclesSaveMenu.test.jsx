import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ChroniclesSaveMenu from './ChroniclesSaveMenu.jsx';

function menu(saves, props = {}) {
  return renderToStaticMarkup(
    <ChroniclesSaveMenu
      saves={saves}
      onNew={vi.fn()}
      onLoad={vi.fn()}
      onRename={vi.fn()}
      onForget={vi.fn()}
      onExit={vi.fn()}
      {...props}
    />,
  );
}

describe('Chronicles expedition entry', () => {
  it('prioritizes a new campaign when there are no saves and hides secondary options', () => {
    const html = menu([]);
    expect(html).toContain('Nueva campaña');
    expect(html).toContain('Más opciones de juego');
    expect(html).not.toContain('Continuar expedición');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Volver al castillo');
    expect(html).toContain('data-chronicles-save-menu="home"');
    expect(html).not.toContain('id="chronicles-save-menu-more"');
  });

  it('shows an explicit retry only for failed catalog sync, disabled while busy', () => {
    const error = 'No se pudo consultar el servidor.';
    const html = menu([], { error, onRetrySync: vi.fn() });
    expect(html).toContain(error);
    expect(html).toContain('Reintentar sincronización');
    expect(html).toContain('role="alert"');
    expect(menu([])).not.toContain('Reintentar sincronización');

    const busyHtml = menu([], { error, busyRunId: 'run-1', onRetrySync: vi.fn() });
    expect(busyHtml).toMatch(/disabled=""[^>]*>Reintentar sincronización<\/button>/);
  });

  it('shows the selected server run identity without putting checkpoint state in HTML', () => {
    const html = menu([{
      id: 'run-123', active: true, title: 'Swordhaven y compañía',
      currentMapId: 'swordhaven-square', createdAt: 1, updatedAt: 1_760_000_000_000,
    }]);
    expect(html).toContain('Continuar expedición');
    expect(html).toContain('Swordhaven y compañía');
    expect(html).toContain('Swordhaven');
    expect(html).not.toContain('worldFlags');
    expect(html).not.toContain('claimedRewards');
  });
});
