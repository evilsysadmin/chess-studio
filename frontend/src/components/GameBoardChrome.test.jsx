import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth.js', () => ({ getUsername: () => 'JugadorTest' }));
vi.mock('../cpuIdentity.js', () => ({
  CPU_IDENTITY: {
    name: 'Matthias',
    role: 'Rival teutón',
    avatar: '/matthias-test.webp',
  },
}));

import GameCommandDeck from './GameCommandDeck.jsx';
import GamePlayerRail from './GamePlayerRail.jsx';
import GameStatusStrips from './GameStatusStrips.jsx';

const noop = () => {};

describe('game board chrome extracted from GameBoardView', () => {
  it('preserves the CPU rail identity, rivalry and low ticking clock', () => {
    const html = renderToStaticMarkup(
      <GamePlayerRail
        game={{ turn: 'b', isGameOver: false, difficulty: 6 }}
        humanColor="w"
        rivalryRecord={{ games: 4, wins: 1, draws: 1, losses: 2 }}
        clocks={{ hasClock: true, tickingColor: 'b', flagFallen: false, forcedOutcome: null }}
        color="b"
        seconds={9}
        cpu
      />,
    );

    expect(html).toContain('game-player-rail is-cpu is-active');
    expect(html).toContain('/matthias-test.webp');
    expect(html).toContain('Matthias');
    expect(html).toContain('duelo 1V 1T 2D');
    expect(html).toContain('clock-chip ticking low');
    expect(html).toContain('title="TURNO CPU"');
  });

  it('keeps the default command deck controls and compact Focus action', () => {
    const html = renderToStaticMarkup(
      <GameCommandDeck
        game={{ history: [{ san: 'e4' }] }}
        zenMode={false}
        controls={{
          hintMode: 'free',
          canHint: true,
          hintButtonLabel: 'Pista',
          busy: false,
          onHint: noop,
          onUndo: noop,
          onToggleZen: noop,
          onAbandon: noop,
        }}
        isThreeD
        compactViewport
        onToggleBoardRenderer={noop}
        onEnterFocus={noop}
      />,
    );

    expect(html).toContain('game-command-deck');
    expect(html).toContain('Pista');
    expect(html).toContain('Deshacer jugada');
    expect(html).toContain('Vista · 3D');
    expect(html).toContain('Zen · OFF');
    expect(html).toContain('Focus');
    expect(html).toContain('Abandonar partida');
  });

  it('preserves status strips including Matthias silent avatar', () => {
    const html = renderToStaticMarkup(
      <GameStatusStrips
        game={{ difficulty: 5, ghostStyle: true }}
        zenMode={false}
        focusActive={false}
        status={{
          statusClass: 'playing',
          turnBanner: true,
          busy: false,
          statusText: 'Tu turno',
          audienceReaction: 'Ufff.',
          matthiasSilentBeat: true,
        }}
        context={{
          memoryContext: {
            suddenDeath: true,
            nemesis: true,
            nemesisLabel: 'e4 otra vez',
          },
          suddenLives: 2,
          controlPrompt: null,
          onContinueControl: noop,
          seriesState: null,
          runState: null,
          achievementToast: null,
        }}
      />,
    );

    expect(html).toContain('status-line playing pulse');
    expect(html).toContain('Grada anónima');
    expect(html).toContain('matthias-silent-beat');
    expect(html).toContain('/matthias-test.webp');
    expect(html).toContain('Sudden Death · vidas: ♥♥♡');
    expect(html).toContain('Némesis · e4 otra vez');
    expect(html).toContain('Modo Rival Fantasma · nivel 5');
  });
});
