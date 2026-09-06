import { describe, expect, it, vi } from 'vitest';
import {
  activateHomeCastleRoom,
  homeBoardSquareLayout,
  homeCastleWarmKeyIntensity,
} from './HomeCastleHubScene.jsx';

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

  it('usa las rutas reales de torneo, Combat y desafío diario', () => {
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

  it('convierte la puerta Entrenar en acceso directo a la Escuela real', () => {
    const school = { click: vi.fn() };
    const root = rootWith({ '.home-school-card': school });

    expect(activateHomeCastleRoom('train', root)).toBe(true);
    expect(school.click).toHaveBeenCalledTimes(1);
    expect(root.querySelector).toHaveBeenCalledWith('.home-school-card');
  });
});

describe('HomeCastleHubScene static render contracts', () => {
  it('mantiene el tablero completo en dos lotes instanciables de 32 casillas', () => {
    const layout = homeBoardSquareLayout();
    expect(layout.light).toHaveLength(32);
    expect(layout.dark).toHaveLength(32);

    const all = [...layout.light, ...layout.dark].map((position) => position.join(','));
    expect(new Set(all).size).toBe(64);
    expect(layout.light[0][0]).toBeCloseTo(-1.33, 8);
    expect(layout.light[0][1]).toBeCloseTo(0.91, 8);
    expect(layout.light[0][2]).toBeCloseTo(-1.33, 8);
    expect(layout.dark[0][0]).toBeCloseTo(-0.95, 8);
    expect(layout.dark[0][2]).toBeCloseTo(-1.33, 8);
  });

  it('el ambiente sólo cambia la intensidad de la luz cálida principal', () => {
    expect(homeCastleWarmKeyIntensity('quiet')).toBe(1.55);
    expect(homeCastleWarmKeyIntensity('active')).toBe(1.55);
    expect(homeCastleWarmKeyIntensity('campaign')).toBe(1.55);
    expect(homeCastleWarmKeyIntensity('honour')).toBe(1.78);
  });
});
