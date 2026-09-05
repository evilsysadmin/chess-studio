import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activateHomeCastleRoom } from './HomeCastleHubScene.jsx';

describe('HomeCastleHubScene room navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prioriza continuar partida sobre partida rápida en la sala Jugar', () => {
    const continueButton = document.createElement('button');
    continueButton.className = 'home-continue-card';
    const quickButton = document.createElement('button');
    quickButton.className = 'home-mode-quick';
    const onContinue = vi.fn();
    const onQuick = vi.fn();
    continueButton.addEventListener('click', onContinue);
    quickButton.addEventListener('click', onQuick);
    document.body.append(continueButton, quickButton);

    expect(activateHomeCastleRoom('play')).toBe(true);
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onQuick).not.toHaveBeenCalled();
  });

  it('usa las puertas existentes de torneo, Combat y desafío diario', () => {
    const tournament = document.createElement('button');
    tournament.className = 'home-mode-featured';
    const combat = document.createElement('button');
    combat.className = 'home-mode-campaign';
    const daily = document.createElement('div');
    daily.className = 'home-today-actions';
    const dailyButton = document.createElement('button');
    daily.appendChild(dailyButton);
    const tournamentClick = vi.fn();
    const combatClick = vi.fn();
    const dailyClick = vi.fn();
    tournament.addEventListener('click', tournamentClick);
    combat.addEventListener('click', combatClick);
    dailyButton.addEventListener('click', dailyClick);
    document.body.append(tournament, combat, daily);

    expect(activateHomeCastleRoom('tournament')).toBe(true);
    expect(activateHomeCastleRoom('combat')).toBe(true);
    expect(activateHomeCastleRoom('daily')).toBe(true);
    expect(tournamentClick).toHaveBeenCalledTimes(1);
    expect(combatClick).toHaveBeenCalledTimes(1);
    expect(dailyClick).toHaveBeenCalledTimes(1);
  });

  it('lleva Entrenar a la zona real de aprendizaje sin inventar otra ruta', () => {
    const learning = document.createElement('section');
    learning.className = 'home-primary-group';
    learning.scrollIntoView = vi.fn();
    document.body.appendChild(learning);

    expect(activateHomeCastleRoom('train')).toBe(true);
    expect(learning.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});
