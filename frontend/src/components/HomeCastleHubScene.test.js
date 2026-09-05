import { describe, expect, it, vi } from 'vitest';
import { activateHomeCastleRoom } from './HomeCastleHubScene.jsx';

function rootWith(entries = {}) {
  return {
    querySelector: vi.fn((selector) => entries[selector] || null),
  };
}

describe('HomeCastleHubScene room navigation', () => {
  it('prioriza continuar partida sobre partida rápida en la sala Jugar', () => {
    const continueButton = { click: vi.fn() };
    const quickButton = { click: vi.fn() };
    const root = rootWith({
      '.home-continue-card': continueButton,
      '.home-mode-quick': quickButton,
    });

    expect(activateHomeCastleRoom('play', root)).toBe(true);
    expect(continueButton.click).toHaveBeenCalledTimes(1);
    expect(quickButton.click).not.toHaveBeenCalled();
    expect(root.querySelector).toHaveBeenCalledWith('.home-continue-card');
  });

  it('usa las puertas existentes de torneo, Combat y desafío diario', () => {
    const tournament = { click: vi.fn() };
    const combat = { click: vi.fn() };
    const daily = { click: vi.fn() };
    const root = rootWith({
      '.home-mode-featured': tournament,
      '.home-mode-campaign': combat,
      '.home-today-actions button': daily,
    });

    expect(activateHomeCastleRoom('tournament', root)).toBe(true);
    expect(activateHomeCastleRoom('combat', root)).toBe(true);
    expect(activateHomeCastleRoom('daily', root)).toBe(true);
    expect(tournament.click).toHaveBeenCalledTimes(1);
    expect(combat.click).toHaveBeenCalledTimes(1);
    expect(daily.click).toHaveBeenCalledTimes(1);
  });

  it('lleva Entrenar a la zona real de aprendizaje sin inventar otra ruta', () => {
    const learning = { scrollIntoView: vi.fn() };
    const root = rootWith({
      '.home-primary-group:not(.home-modes-section)': learning,
    });

    expect(activateHomeCastleRoom('train', root)).toBe(true);
    expect(learning.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});
