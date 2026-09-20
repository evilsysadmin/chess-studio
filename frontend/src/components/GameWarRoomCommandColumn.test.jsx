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

vi.mock('../zenMode.js', () => ({
  zenModeSummary: (active) => (active ? 'Zen activo' : 'Zen desactivado'),
}));

import GameWarRoomCommandColumn from './GameWarRoomCommandColumn.jsx';

describe('GameWarRoomCommandColumn', () => {
  it('reúne Matthias, turno y acciones sin reintroducir identidad del jugador', () => {
    const html = renderToStaticMarkup(
      <GameWarRoomCommandColumn
        game={{ difficulty: 7, turn: 'w', humanColor: 'w', isGameOver: false, history: [] }}
        status={{ statusText: 'Tu turno', busy: false }}
        board={{ onCustomize: () => {} }}
        controls={{
          hintMode: 'off',
          onToggleZen: () => {},
          onAbandon: () => {},
        }}
      />,
    );

    expect(html).toContain('data-matthias-war-room-presence="king-piece"');
    expect(html).toContain('game-3d-turn-pill game-3d-matthias-card is-green');
    expect(html).toContain('aria-label="Estado de la partida"');
    expect(html).not.toContain('game-3d-human-id');
    expect(html).not.toContain('game-3d-turn-pill-versus');
    expect(html).toContain('Matthias');
    expect(html).not.toContain('CPU nivel');
    expect(html).toContain('Tu turno');
    expect(html).toContain('/matthias.png');
    expect(html).toContain('Más acciones de partida');
    expect(html).toContain('Apariencia');
    expect((html.match(/>Apariencia<\/button>/g) || []).length).toBe(1);
    expect(html).toContain('Modo Zen');
    expect(html).toContain('Abandonar partida');
    expect(html).not.toContain('game-3d-warroom-controls');
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
      />,
    );
    const busyHtml = renderToStaticMarkup(
      <GameWarRoomCommandColumn
        game={{ difficulty: 3, turn: 'b', humanColor: 'w', isGameOver: false }}
        status={{ statusText: 'La CPU está pensando…', busy: true }}
        board={{ onCustomize: null }}
      />,
    );

    expect(cpuHtml).toContain('game-3d-turn-pill game-3d-matthias-card is-red');
    expect(cpuHtml).toContain('Matthias juega');
    expect(busyHtml).toContain('game-3d-turn-pill game-3d-matthias-card is-amber');
    expect(busyHtml).toContain('Pensando…');
  });

  it('mantiene las acciones comunes idénticas y limita los extras al HUD compacto', () => {
    const game = {
      difficulty: 5,
      turn: 'w',
      humanColor: 'w',
      isGameOver: false,
      history: ['e4'],
    };
    const controls = {
      hintMode: 'free',
      hintButtonLabel: 'Pista táctica',
      canHint: true,
      busy: false,
      onHint: () => {},
      onUndo: () => {},
      onToggleZen: () => {},
      onAbandon: () => {},
    };
    const board = { onCustomize: () => {} };

    const desktopHtml = renderToStaticMarkup(
      <GameWarRoomCommandColumn
        game={game}
        status={{ statusText: 'Tu turno', busy: false }}
        board={board}
        controls={controls}
      />,
    );
    const compactHtml = renderToStaticMarkup(
      <GameWarRoomCommandColumn
        game={game}
        status={{ statusText: 'Tu turno', busy: false }}
        board={board}
        controls={controls}
        compactViewport
      />,
    );

    for (const label of ['Pista táctica', 'Deshacer jugada', 'Apariencia', 'Modo Zen', 'Abandonar partida']) {
      const button = new RegExp(`>${label}<\\/button>`, 'g');
      expect((desktopHtml.match(button) || []).length).toBe(1);
      expect((compactHtml.match(button) || []).length).toBe(1);
    }

    expect(desktopHtml).not.toContain('>Focus</button>');
    expect(desktopHtml).not.toContain('>Vista 2D</button>');
    expect(compactHtml).toContain('>Focus</button>');
    expect(compactHtml).toContain('>Vista 2D</button>');
  });
});
