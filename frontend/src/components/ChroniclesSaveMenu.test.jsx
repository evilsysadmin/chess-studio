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
  it('shows New, Load and Save management without allocating a new run on mount', () => {
    const html = menu([]);
    expect(html).toContain('Nuevo juego');
    expect(html).toContain('Continuar partida');
    expect(html).toContain('Cargar juego');
    expect(html).toContain('Gestionar partidas');
    expect(html).toContain('Volver al castillo');
    expect(html).toContain('data-chronicles-save-menu="home"');
    expect(html).toContain('disabled=""');
  });

  it('shows an explicit authored campaign choice without displacing the legacy new game', () => {
    const html = menu([], { onNewCampaign: vi.fn() });
    expect(html).toContain('Nueva campaña');
    expect(html).toContain('Nuevo juego');
    expect(html).toContain('chronicles-save-menu__new-choices');
    expect(menu([])).not.toContain('Nueva campaña');
  });

  it('names authored wilderness and campaign Swordhaven in saved run listings', () => {
    // The home screen only renders the most recent resumable run. Check
    // each location as the selected run rather than expecting both in one
    // server-rendered home screen (the full catalog is a separate view).
    const road = menu([
      { id: 'road-1', title: 'Primera pista', currentMapId: 'banner-road', updatedAt: 1_760_000_000_000 },
    ]);
    const town = menu([
      { id: 'town-1', title: 'Inicio', currentMapId: 'swordhaven-campaign', updatedAt: 1_760_000_000_000 },
    ]);
    expect(road).toContain('Camino de los Estandartes');
    expect(town).toContain('Swordhaven · Campaña');
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
    expect(html).toContain('Swordhaven y compañía');
    expect(html).toContain('Swordhaven');
    expect(html).not.toContain('worldFlags');
    expect(html).not.toContain('claimedRewards');
  });
});
