import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./GameChat.jsx', () => ({
  default: () => <div data-game-chat="true">chat</div>,
}));

vi.mock('../cpuIdentity.js', () => ({
  CPU_IDENTITY: {
    name: 'Matthias',
    role: 'Gran maestro gruñón',
  },
}));

import GameWarRoomCommandColumn from './GameWarRoomCommandColumn.jsx';

describe('GameWarRoomCommandColumn', () => {
  it('usa al rey-peón como presencia visual de Matthias y devuelve el hueco al briefing/chat', () => {
    const html = renderToStaticMarkup(
      <GameWarRoomCommandColumn
        game={{ difficulty: 7 }}
        rivalryRecord={{ games: 6, wins: 2, draws: 1, losses: 3 }}
        status={{ statusText: 'Juegan negras' }}
        board={{ onCustomize: null }}
        side={{ gameChat: [], gameContextMessages: [] }}
        compactViewport={false}
        onToggleBoardRenderer={() => {}}
      />,
    );

    expect(html).toContain('data-matthias-war-room-presence="king-piece"');
    expect(html).toContain('RIVAL EN SALA');
    expect(html).toContain('<h2>Matthias</h2>');
    expect(html).toContain('Gran maestro gruñón · nivel 7');
    expect(html).toContain('2V · 1T · 3D contra ti');
    expect(html).toContain('Juegan negras');
    expect(html).toContain('data-game-chat="true"');
    expect(html).not.toContain('game-3d-matthias-portrait');
    expect(html).not.toContain('<img');
  });
});
