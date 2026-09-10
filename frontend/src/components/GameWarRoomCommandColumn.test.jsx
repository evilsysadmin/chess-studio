import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../cpuIdentity.js', () => ({
  CPU_IDENTITY: {
    name: 'Matthias',
    role: 'Gran maestro gruñón',
    avatar: '/matthias.png',
  },
}));

vi.mock('../auth.js', () => ({
  getUsername: () => 'evilsysadmin',
}));

vi.mock('../zenMode.js', () => ({
  zenModeSummary: (active) => (active ? 'Zen activo' : 'Zen desactivado'),
}));

import GameWarRoomCommandColumn from './GameWarRoomCommandColumn.jsx';

describe('GameWarRoomCommandColumn', () => {
  it('reúne jugador, Matthias, turno y acciones en el encabezado del rail', () => {
    const html = renderToStaticMarkup(
      <GameWarRoomCommandColumn
        game={{ difficulty: 7, turn: 'w', humanColor: 'w', isGameOver: false, history: [] }}
        status={{ statusText: 'Tu turno', busy: false }}
        board={{ onCustomize: null }}
        controls={{
          hintMode: 'off',
          onToggleZen: () => {},
          onAbandon: () => {},
        }}
        onToggleBoardRenderer={() => {}}
      />,
    );

    expect(html).toContain('data-matthias-war-room-presence="king-piece"');
    expect(html).toContain('game-3d-turn-pill game-3d-matthias-card is-green');
    expect(html).toContain('aria-label="Estado de la partida"');
    expect(html).toContain('evilsysadmin');
    expect(html).toContain('Matthias');
    expect(html).toContain('CPU nivel 7');
    expect(html).toContain('Tu turno');
    expect(html).toContain('/matthias.png');
    expect(html).toContain('Más acciones de partida');
    expect(html).toContain('Modo Zen');
    expect(html).toContain('Abandonar partida');
    expect(html).toContain('game-3d-warroom-controls');
    expect(html).not.toContain('RIVAL EN SALA');
    expect(html).not.toContain('is-diegetic-briefing');
    expect(html).not.toContain('game-3d-warroom-status');
    expect(html).not.toContain('contra ti');
  });

  it('usa rojo para Matthias y ámbar mientras la CPU piensa', () => {
    const cpuHtml = renderToStaticMarkup(
      <GameWarRoomCommandColumn
        game={{ difficulty: 3, turn: 'b', humanColor: 'w', isGameOver: false }}
        status={{ statusText: 'Turno de la CPU', busy: false }}
        board={{ onCustomize: null }}
        onToggleBoardRenderer={() => {}}
      />,
    );
    const busyHtml = renderToStaticMarkup(
      <GameWarRoomCommandColumn
        game={{ difficulty: 3, turn: 'b', humanColor: 'w', isGameOver: false }}
        status={{ statusText: 'La CPU está pensando…', busy: true }}
        board={{ onCustomize: null }}
        onToggleBoardRenderer={() => {}}
      />,
    );

    expect(cpuHtml).toContain('game-3d-turn-pill game-3d-matthias-card is-red');
    expect(cpuHtml).toContain('Matthias juega');
    expect(busyHtml).toContain('game-3d-turn-pill game-3d-matthias-card is-amber');
    expect(busyHtml).toContain('Pensando…');
  });
});
