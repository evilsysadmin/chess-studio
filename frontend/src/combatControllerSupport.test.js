import { describe, expect, it } from 'vitest';
import { annotateCombatCandidates, emergencyCombatCpuSuggestion, emptyUnitBattleStats, incrementIdentityCounter, isLegalCombatCpuSuggestion, resolveCombatCpuTurnSuggestion, resolveHumanColor, selectCombatAwareRemoteSuggestion } from './combatControllerSupport.js';
import { buildCombatBattleState } from './combatBattleState.js';

describe('combat controller support', () => {
  it('resuelve color explícito o aleatorio sin esconder Math.random en el controlador', () => {
    expect(resolveHumanColor('w', () => 0.99)).toBe('w');
    expect(resolveHumanColor('random', () => 0.1)).toBe('w');
    expect(resolveHumanColor('random', () => 0.9)).toBe('b');
  });
  it('mantiene contadores de identidad inmutables y stats limpios', () => {
    expect(emptyUnitBattleStats()).toEqual({ killsByIdentity: {}, bossDamageByIdentity: {}, bossFinisherIdentityId: null, underdogCredits: 0, tacticalCredits: 0 });
    const source = { a: 1 };
    expect(incrementIdentityCounter(source, 'a', 2)).toEqual({ a: 3 });
    expect(source).toEqual({ a: 1 });
  });
  it('construye snapshots persistibles sin acoplar la forma al hook', () => {
    expect(buildCombatBattleState({ fen: 'fen', registry: {}, humanColor: 'w', combatLog: [], uiLog: [{ text: 'captura', kind: 'capture' }], autoLevelUpEnabled: false, focus: {}, positionCounts: new Map([['x', 2]]).entries(), bossHp: 3, bossPhase: 2 })).toMatchObject({ phase: 'battle', fen: 'fen', humanColor: 'w', positionCounts: [['x', 2]], bossHp: 3, bossPhase: 2, uiLog: [{ text: 'captura', kind: 'capture' }], autoLevelUpEnabled: false });
  });

  it('rechaza respuestas CPU malformadas o ilegales antes de bloquear el turno', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(isLegalCombatCpuSuggestion(start, { from: 'e2', to: 'e4' })).toBe(true);
    expect(isLegalCombatCpuSuggestion(start, { from: 'e2', to: 'e5' })).toBe(false);
    expect(isLegalCombatCpuSuggestion(start, { nope: true })).toBe(false);
    expect(isLegalCombatCpuSuggestion('fen-roto', { from: 'e2', to: 'e4' })).toBe(false);
    expect(isLegalCombatCpuSuggestion(start, { from: 'e2', to: 'e4', promotion: 'k' })).toBe(false);

    const promotion = '7k/P7/8/8/8/8/8/7K w - - 0 1';
    expect(isLegalCombatCpuSuggestion(promotion, { from: 'a7', to: 'a8' })).toBe(true);
    expect(isLegalCombatCpuSuggestion(promotion, { from: 'a7', to: 'a8', promotion: 'n' })).toBe(true);
    expect(isLegalCombatCpuSuggestion(promotion, { from: 'a7', to: 'a8', promotion: 'k' })).toBe(false);
    expect(isLegalCombatCpuSuggestion(start, { from: 'e2', to: 'e4', promotion: 'q' })).toBe(false);
  });

  it('usa los hechos reales de Combat para corregir una captura arriesgada sin sustituir el orden profundo por el shortlist', () => {
    const fen = 'r7/7k/8/8/8/8/8/Q6K b - - 0 1';
    const registry = {
      a8: { id: 'b-r-a8', type: 'r', color: 'b', square: 'a8', strengthPoints: 0, speedPoints: 0 },
      h8: { id: 'b-k-h8', type: 'k', color: 'b', square: 'h8', strengthPoints: 0, speedPoints: 0 },
      a1: { id: 'w-q-a1', identityId: 'veteran-queen', type: 'q', color: 'w', square: 'a1', strengthPoints: 2, speedPoints: 1 },
      h1: { id: 'w-k-h1', type: 'k', color: 'w', square: 'h1', strengthPoints: 0, speedPoints: 0 },
    };
    const remote = {
      from: 'a8',
      to: 'a1',
      candidates: [
        { from: 'a8', to: 'a1', moveKey: 'a8a1', chessScoreCp: 40, isLegal: true },
        { from: 'a8', to: 'b8', moveKey: 'a8b8', chessScoreCp: 0, isLegal: true },
      ],
    };

    const measured = annotateCombatCandidates(fen, registry, remote);
    const capture = measured.candidates[0];
    expect(capture.combatReady).toBe(true);
    expect(capture.hitChance).toBeGreaterThanOrEqual(0.5);
    expect(capture.hitChance).toBeLessThan(1);
    expect(capture.enemyValue).toBe(9);
    expect(capture.enemyPersistentValue).toBe(3);

    const chosen = selectCombatAwareRemoteSuggestion(measured);
    expect(chosen.moveKey).toBe('a8b8');

    const noFacts = annotateCombatCandidates(fen, {}, remote);
    expect(selectCombatAwareRemoteSuggestion(noFacts)).toBe(noFacts);
  });

  it('si cae el análisis remoto puede elegir una jugada legal local y no secuestra la batalla', async () => {
    const startBlack = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const fallback = emergencyCombatCpuSuggestion(startBlack);
    expect(fallback).toBeTruthy();
    expect(isLegalCombatCpuSuggestion(startBlack, fallback)).toBe(true);
    expect(emergencyCombatCpuSuggestion('fen-roto')).toBeNull();

    const recovered = await resolveCombatCpuTurnSuggestion({
      fen: startBlack,
      difficulty: 4,
      analyzePosition: async () => { throw new Error('Workers/analysis caído'); },
    });
    expect(recovered.source).toBe('local');
    expect(isLegalCombatCpuSuggestion(startBlack, recovered.suggestion)).toBe(true);
  });

  it('también degrada a local si el servidor devuelve una jugada ilegal', async () => {
    const startBlack = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const recovered = await resolveCombatCpuTurnSuggestion({
      fen: startBlack,
      difficulty: 4,
      analyzePosition: async () => ({ from: 'e7', to: 'e4' }),
    });
    expect(recovered.source).toBe('local');
    expect(isLegalCombatCpuSuggestion(startBlack, recovered.suggestion)).toBe(true);
  });

});
