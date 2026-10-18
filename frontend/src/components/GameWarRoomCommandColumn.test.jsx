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
    expect(html).toContain('game-3d-turn-pill is-green');
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
    expect(html).not.toContain('Abandonar partida');
    expect(html).toContain('aria-label="Mi cuenta"');
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

    expect(cpuHtml).toContain('game-3d-turn-pill is-red');
    expect(cpuHtml).toContain('Matthias juega');
    expect(busyHtml).toContain('game-3d-turn-pill is-amber');
    expect(busyHtml).toContain('Pensando…');
  });

  it('confirma visualmente la jugada optimista sin afirmar que el backend la aceptó', () => {
    const game = { turn: 'w', humanColor: 'w', isGameOver: false };
    for (const compactViewport of [false, true]) {
      const render = (status) => renderToStaticMarkup(
        <GameWarRoomCommandColumn game={game} status={status} board={{}} compactViewport={compactViewport} />,
      );
      const pending = render({ statusText: 'La CPU está pensando…', busy: true, pendingMove: true });
      expect(pending).toContain(compactViewport ? 'game-3d-turn-pill is-compact is-amber' : 'game-3d-turn-pill is-amber');
      expect(pending).toContain('Confirmando jugada…');
      expect(pending).not.toContain('>Pensando…</strong>');
      expect(render({ statusText: 'La CPU está pensando…', busy: true, pendingMove: false })).toContain('Pensando…');
      expect(render({ statusText: 'Tu turno', busy: false, pendingMove: false })).toContain('Tu turno');
      const terminal = render({ statusText: 'Jaque mate', busy: true, pendingMove: true });
      expect(terminal).toContain('Jaque mate');
      expect(terminal).not.toContain('Confirmando jugada…');
    }
  });

  it('no muestra a Matthias pensando tras mate o caída de bandera aunque busy sea antiguo', () => {
    for (const { game, status, expected } of [
      {
        game: { turn: 'b', humanColor: 'w', isGameOver: true },
        status: { statusText: 'La CPU está pensando…', busy: true },
        expected: 'Partida terminada',
      },
      {
        game: { turn: 'w', humanColor: 'w', isGameOver: false },
        status: { statusText: 'Se acabó el tiempo (blancas)', busy: true },
        expected: 'Se acabó el tiempo (blancas)',
      },
      {
        game: { turn: 'b', humanColor: 'w', isGameOver: true },
        status: { statusText: 'Jaque mate', busy: false },
        expected: 'Jaque mate',
      },
    ]) {
      const html = renderToStaticMarkup(<GameWarRoomCommandColumn game={game} status={status} board={{}} />);
      expect(html).toContain('game-3d-turn-pill is-amber');
      expect(html).toContain(expected);
      expect(html).not.toContain('>Pensando…</strong>');
    }
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

    for (const label of ['Pista táctica', 'Deshacer jugada', 'Apariencia', 'Modo Zen']) {
      const button = new RegExp(`>${label}<\\/button>`, 'g');
      expect((desktopHtml.match(button) || []).length).toBe(1);
      expect((compactHtml.match(button) || []).length).toBe(1);
    }

    expect(desktopHtml).not.toContain('>Focus</button>');
    expect(desktopHtml).not.toContain('>Vista 2D</button>');
    expect(compactHtml).toContain('>Focus</button>');
    expect(compactHtml).toContain('>Vista 2D</button>');
    expect(desktopHtml).not.toContain('Abandonar partida');
    expect(compactHtml).not.toContain('Abandonar partida');
    expect(desktopHtml).toContain('aria-label="Mi cuenta"');
    expect(compactHtml).toContain('aria-label="Mi cuenta"');
  });
});
