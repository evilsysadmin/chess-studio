import { describe, expect, it } from 'vitest';
import {
  adaptiveCombatDifficulty,
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
});
