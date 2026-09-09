import { describe, expect, it } from 'vitest';
import {
  adaptiveCombatDifficulty,
  calibrateCombatEngineDifficulty,
  combatAdaptiveRelief,
  COMBAT_ADAPTIVE_MAX_RELIEF,
} from './combatAdaptiveDifficulty.js';

const battle = (outcome) => ({ outcome, variant: 'roguelike' });

describe('Combat Chess adaptive difficulty', () => {
  it('baja un poco tras una derrota y más tras dos seguidas', () => {
    expect(combatAdaptiveRelief([battle('loss')])).toBe(-5);
    expect(combatAdaptiveRelief([battle('loss'), battle('loss')])).toBe(-9);
  });

  it('trata una retirada como señal suave y nunca como una derrota completa', () => {
    expect(combatAdaptiveRelief([battle('retired')])).toBe(-3);
    expect(combatAdaptiveRelief([battle('loss'), battle('retired')])).toBe(-7);
  });

  it('da alivio fuerte a una mala racha pero respeta el tope', () => {
    const history = Array.from({ length: 6 }, () => battle('loss'));
    const relief = combatAdaptiveRelief(history);
    expect(relief).toBe(-COMBAT_ADAPTIVE_MAX_RELIEF);
  });

  it('retira el alivio tras dos victorias consecutivas', () => {
    expect(combatAdaptiveRelief([
      battle('win'),
      battle('win'),
      battle('loss'),
      battle('loss'),
      battle('loss'),
    ])).toBe(0);
  });

  it('nunca aumenta la dificultad y nunca baja de 5', () => {
    expect(adaptiveCombatDifficulty(40, [battle('win'), battle('win')])).toMatchObject({ base: 40, adjusted: 40, relief: 0 });
    expect(adaptiveCombatDifficulty(12, Array.from({ length: 6 }, () => battle('loss')))).toMatchObject({ base: 12, adjusted: 5, relief: -7 });
  });

  it('mantiene identidad hasta 60 y retrasa los cambios de profundidad 70/90', () => {
    expect(calibrateCombatEngineDifficulty(60)).toBe(60);
    expect(calibrateCombatEngineDifficulty(73)).toBe(69);
    expect(calibrateCombatEngineDifficulty(74)).toBe(70);
    expect(calibrateCombatEngineDifficulty(92)).toBe(89);
    expect(calibrateCombatEngineDifficulty(93)).toBe(90);
    expect(calibrateCombatEngineDifficulty(95)).toBe(94);
  });

  it('la calibración es monótona y nunca hace al motor más fuerte que la estrategia', () => {
    let previous = 0;
    for (let raw = 5; raw <= 95; raw += 1) {
      const calibrated = calibrateCombatEngineDifficulty(raw);
      expect(calibrated).toBeGreaterThanOrEqual(previous);
      expect(calibrated).toBeLessThanOrEqual(raw);
      previous = calibrated;
    }
  });

  it('separa el alivio por historial de la calibración del motor', () => {
    const result = adaptiveCombatDifficulty(80, [battle('loss')]);
    expect(result.base).toBe(80);
    expect(result.strategicAdjusted).toBe(75);
    expect(result.relief).toBe(-5);
    expect(result.requestedRelief).toBe(-5);
    expect(result.adjusted).toBeLessThanOrEqual(result.strategicAdjusted);
    expect(result.engineAdjustment).toBe(result.adjusted - result.strategicAdjusted);
  });
});
