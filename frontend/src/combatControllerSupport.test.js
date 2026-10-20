import { describe, expect, it } from 'vitest';
import { annotateCombatCandidates, buildCombatSessionSnapshot, emergencyCombatCpuSuggestion, emptyUnitBattleStats, incrementIdentityCounter, isLegalCombatCpuSuggestion, resolveCombatCpuTurnSuggestion, resolveHumanColor, selectCombatAwareRemoteSuggestion } from './combatControllerSupport.js';

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
    expect(buildCombatSessionSnapshot({ fen: 'fen', registry: {}, humanColor: 'w', combatLog: [], uiLog: [{ text: 'captura', kind: 'capture' }], autoLevelUpEnabled: false, focus: {}, positionCounts: new Map([['x', 2]]).entries(), bossHp: 3, bossPhase: 2 })).toMatchObject({ phase: 'battle', fen: 'fen', humanColor: 'w', positionCounts: [['x', 2]], bossHp: 3, bossPhase: 2, uiLog: [{ text: 'captura', kind: 'capture' }], autoLevelUpEnabled: false });
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

  it('desmiente mates inventados por el shortlist y conserva los mates reales', () => {
    const fen = '7k/8/5KQ1/8/8/8/8/8 w - - 0 1';
    const registry = {
      g6: { id: 'w-q-g6', color: 'w', type: 'q', square: 'g6' },
      f6: { id: 'w-k-f6', color: 'w', type: 'k', square: 'f6' },
      h8: { id: 'b-k-h8', color: 'b', type: 'k', square: 'h8' },
    };
    const remote = {
      from: 'g6', to: 'g5',
      candidates: [
        { from: 'g6', to: 'g5', moveKey: 'g6g5', isLegal: true, isMate: true, chessScoreCp: 10 },
        { from: 'g6', to: 'g7', moveKey: 'g6g7', isLegal: true, isMate: true, chessScoreCp: 0 },
      ],
    };
    const checked = annotateCombatCandidates(fen, registry, remote);
    expect(checked.candidates[0]).toMatchObject({ combatReady: true, isMate: false });
    expect(checked.candidates[1]).toMatchObject({ combatReady: true, isMate: true });
    expect(selectCombatAwareRemoteSuggestion(checked).to).toBe('g7');
    expect(remote.candidates[0].isMate).toBe(true); // fuente sin mutar

    const onlyFalse = {
      ...remote, candidates: [remote.candidates[0]],
    };
    expect(annotateCombatCandidates(fen, registry, onlyFalse).candidates[0].isMate).toBe(false);
  });

  it('no sustituye la jugada profunda por candidatos sin puntuación demostrada', () => {
    const remote = {
      from: 'a8', to: 'a1',
      candidates: [
        { from: 'a8', to: 'a1', combatReady: true, chessScoreCp: null, hitChance: 0.5, enemyValue: 9 },
        { from: 'a8', to: 'b8', combatReady: true, chessScoreCp: -10, hitChance: 1, enemyValue: 0 },
      ],
    };
    expect(selectCombatAwareRemoteSuggestion(remote)).toBe(remote);
  });

  it('aplica doctrinas de oficiales sólo a alternativas realmente próximas', async () => {
    const fen = 'r7/6k1/8/8/8/8/8/7K b - - 0 1';
    const registry = {
      a8: { id: 'b-r-a8', color: 'b', type: 'r', square: 'a8' },
      g7: { id: 'b-k-g7', color: 'b', type: 'k', square: 'g7' },
      h1: { id: 'w-k-h1', color: 'w', type: 'k', square: 'h1' },
    };
    const remote = {
      from: 'a8', to: 'b8',
      candidates: [
        { from: 'a8', to: 'b8', moveKey: 'a8b8', chessScoreCp: 10, isLegal: true },
        { from: 'a8', to: 'h8', moveKey: 'a8h8', chessScoreCp: 10, isLegal: true },
      ],
    };
    const noDoctrine = selectCombatAwareRemoteSuggestion(annotateCombatCandidates(fen, registry, remote));
    expect(noDoctrine.to).toBe('b8');

    const pressure = { style: { check: 1 } };
    const measured = annotateCombatCandidates(fen, registry, remote, {}, pressure);
    expect(measured.candidates[1].doctrineBonusCp).toBe(3);
    expect(selectCombatAwareRemoteSuggestion(measured).to).toBe('h8');
    const resolved = await resolveCombatCpuTurnSuggestion({
      fen, difficulty: 50, registry, doctrine: pressure,
      analyzePosition: async () => remote,
    });
    expect(resolved.source).toBe('remote');
    expect(resolved.suggestion.to).toBe('h8');

    const badlyScored = {
      ...remote,
      candidates: remote.candidates.map((candidate) => ({
        ...candidate, chessScoreCp: candidate.to === 'h8' ? -100 : 10,
      })),
    };
    expect(selectCombatAwareRemoteSuggestion(
      annotateCombatCandidates(fen, registry, badlyScored, {}, pressure),
    ).to).toBe('b8');
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

  it('la CPU de emergencia prefiere un jaque fiable a una captura que apenas conecta', async () => {
    const fen = 'r7/P5k1/8/8/8/8/8/7K b - - 0 1';
    const registry = {
      a8: { id: 'b-r-a8', square: 'a8', color: 'b', type: 'r' },
      g7: { id: 'b-k-g7', square: 'g7', color: 'b', type: 'k' },
      a7: { id: 'w-p-a7', square: 'a7', color: 'w', type: 'p', speedPoints: 100 },
      h1: { id: 'w-k-h1', square: 'h1', color: 'w', type: 'k' },
    };
    // Sin datos no se inventan probabilidades: conserva el comportamiento
    // determinista histórico. Con datos, capturar al peón tiene sólo 50%.
    expect(emergencyCombatCpuSuggestion(fen)).toMatchObject({ from: 'a8', to: 'a7' });
    expect(emergencyCombatCpuSuggestion(fen, {})).toMatchObject({ from: 'a8', to: 'a7' });
    expect(emergencyCombatCpuSuggestion(fen, registry)).toMatchObject({ from: 'a8', to: 'h8' });
    expect(isLegalCombatCpuSuggestion(fen, emergencyCombatCpuSuggestion(fen, registry))).toBe(true);

    // Una víctima sin mejoras defensivas vuelve a ser una captura razonable.
    const vulnerable = { ...registry, a7: { ...registry.a7, speedPoints: 0 } };
    expect(emergencyCombatCpuSuggestion(fen, vulnerable)).toMatchObject({ from: 'a8', to: 'a7' });

    const recovered = await resolveCombatCpuTurnSuggestion({
      fen, difficulty: 45, registry,
      analyzePosition: async () => { throw new Error('Análisis remoto no disponible'); },
    });
    expect(recovered.source).toBe('local');
    expect(recovered.suggestion).toMatchObject({ from: 'a8', to: 'h8' });
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
