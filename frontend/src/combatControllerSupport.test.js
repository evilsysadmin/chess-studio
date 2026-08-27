import { describe, expect, it } from 'vitest';
import { buildCombatSessionSnapshot, emptyUnitBattleStats, incrementIdentityCounter, isLegalCombatCpuSuggestion, resolveHumanColor } from './combatControllerSupport.js';

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
    expect(buildCombatSessionSnapshot({ fen: 'fen', registry: {}, humanColor: 'w', combatLog: [], uiLog: [{ text: 'captura', kind: 'capture' }], autoLevelUpEnabled: false, focus: {}, positionCounts: new Map([['x', 2]]).entries(), bossHp: 3, bossPhase: 2 })).toMatchObject({ phase: 'battle', fen: 'fen', humanColor: 'w', positionCounts: [['x', 2]], bossHp: 3, bossPhase: 2, uiLog: [{ text: 'captura', kind: 'capture' }], autoLevelUpEnabled: false });
  });

  it('rechaza respuestas CPU malformadas o ilegales antes de bloquear el turno', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(isLegalCombatCpuSuggestion(start, { from: 'e2', to: 'e4' })).toBe(true);
    expect(isLegalCombatCpuSuggestion(start, { from: 'e2', to: 'e5' })).toBe(false);
    expect(isLegalCombatCpuSuggestion(start, { nope: true })).toBe(false);
    expect(isLegalCombatCpuSuggestion('fen-roto', { from: 'e2', to: 'e4' })).toBe(false);
  });

});
