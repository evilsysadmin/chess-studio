import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { mechanicTutorialById } from '../mechanicTutorials.js';
import GameWarRoomCommandColumn from './GameWarRoomCommandColumn.jsx';

function props(overrides = {}) {
  return {
    game: {
      difficulty: 0,
      humanColor: 'w',
      turn: 'w',
      history: [],
      isGameOver: false,
    },
    status: {},
    board: { onCustomize: vi.fn() },
    controls: {
      hintMode: 'off',
      onAbandon: vi.fn(),
      onToggleZen: vi.fn(),
    },
    ...overrides,
  };
}

describe('War Room first-run guide', () => {
  it('explains the hidden utility menu and resign action explicitly', () => {
    const tutorial = mechanicTutorialById('war-room-basics');
    expect(tutorial).toBeTruthy();
    expect(tutorial.steps).toHaveLength(5);
    expect(tutorial.steps.some((step) => step.text.includes('⋯'))).toBe(true);
    expect(tutorial.steps.some((step) => /Abandonar partida/.test(step.text))).toBe(true);
    expect(tutorial.steps.some((step) => /móvil/.test(step.text))).toBe(true);
  });

  it('keeps the guide reopenable next to the real War Room controls', () => {
    const desktop = renderToStaticMarkup(<GameWarRoomCommandColumn {...props()} />);
    expect(desktop).toContain('aria-label="Abrir guía de la War Room"');
    expect(desktop).toContain('aria-label="Más acciones de partida"');
    expect(desktop).toContain('Abandonar partida');

    const compact = renderToStaticMarkup(<GameWarRoomCommandColumn {...props({ compactViewport: true })} />);
    expect(compact).toContain('aria-label="Abrir guía de la War Room"');
    expect(compact).toContain('aria-label="Abandonar partida"');
    expect(compact).toContain('aria-label="Más acciones de partida"');
  });
});
