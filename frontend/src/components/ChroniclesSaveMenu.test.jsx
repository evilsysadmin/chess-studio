import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ChroniclesSaveMenu from './ChroniclesSaveMenu.jsx';

function menu(saves) {
  return renderToStaticMarkup(
    <ChroniclesSaveMenu
      saves={saves}
      onNew={vi.fn()}
      onLoad={vi.fn()}
      onRename={vi.fn()}
      onForget={vi.fn()}
      onExit={vi.fn()}
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
