import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { buildCombatSessionSnapshot, emptyUnitBattleStats, incrementIdentityCounter, resolveHumanColor, terminalCombatOutcome } from './combatControllerSupport.js';

describe('combat controller support', () => {
  it('resuelve color explícito o aleatorio sin esconder Math.random en el controlador', () => {
    expect(resolveHumanColor('w', () => 0.99)).toBe('w');
    expect(resolveHumanColor('random', () => 0.1)).toBe('w');
    expect(resolveHumanColor('random', () => 0.9)).toBe('b');
  });
  it('mantiene contadores de identidad inmutables y stats limpios', () => {
    expect(emptyUnitBattleStats()).toEqual({ killsByIdentity: {}, bossDamageByIdentity: {}, bossFinisherIdentityId: null });
    const source = { a: 1 };
    expect(incrementIdentityCounter(source, 'a', 2)).toEqual({ a: 3 });
    expect(source).toEqual({ a: 1 });
  });
  it('construye snapshots persistibles sin acoplar la forma al hook', () => {
    expect(buildCombatSessionSnapshot({ fen: 'fen', registry: {}, humanColor: 'w', combatLog: [], focus: {}, positionCounts: new Map([['x', 2]]).entries(), bossHp: 3, bossPhase: 2 })).toMatchObject({ phase: 'battle', fen: 'fen', humanColor: 'w', positionCounts: [['x', 2]], bossHp: 3, bossPhase: 2 });
  });
  it('deriva el resultado de un FEN terminal para cerrar un snapshot recuperado', () => {
    const mateToBlack = new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
    expect(terminalCombatOutcome({ chess: mateToBlack, humanColor: 'w' })).toBe('win');
    expect(terminalCombatOutcome({ chess: mateToBlack, humanColor: 'b' })).toBe('loss');
    expect(terminalCombatOutcome({ chess: new Chess(), humanColor: 'w' })).toBeNull();
    expect(terminalCombatOutcome({ chess: new Chess(), humanColor: 'w', reachedRepetition: true })).toBe('draw');
  });
});
