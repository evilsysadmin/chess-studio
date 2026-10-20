import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { capturedSquareFor, isForcedCombatCapture } from './combat.js';
import { annotateCombatCandidates, emergencyCombatCpuSuggestion, isLegalCombatCpuSuggestion, resolveCombatCpuTurnSuggestion } from './combatControllerSupport.js';

// Posiciones legales mínimas: mantenidas como hechos de ajedrez, no mocks
// de un evaluador. Detectan divergencias entre FEN, registro y selector.
const SCENARIOS = [
  { title: 'al paso', fen: '7k/8/8/3pP3/8/8/8/7K w - d6 0 1', from: 'e5', to: 'd6' },
  { title: 'captura para salir de jaque', fen: 'k6r/8/8/8/8/2B5/8/7K w - - 0 1', from: 'c3', to: 'h8' },
  { title: 'coronación', fen: '7k/P7/8/8/8/8/8/7K w - - 0 1', from: 'a7', to: 'a8', promotion: 'q' },
  { title: 'mate', fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', from: 'g6', to: 'g7' },
];

describe('Combat Chess · escenarios tácticos legales', () => {
  it.each(SCENARIOS)('$title conserva la legalidad del FEN en el selector local', ({ fen, from, to, promotion }) => {
    const board = new Chess(fen);
    const move = board.moves({ square: from, verbose: true }).find(
      (candidate) => candidate.to === to && (!promotion || candidate.promotion === promotion),
    );
    expect(move).toBeTruthy();
    expect(isLegalCombatCpuSuggestion(fen, { from, to, ...(promotion ? { promotion } : {}) })).toBe(true);
  });

  it('al paso mide el peón capturado en d5, no la casilla vacía d6', () => {
    const fen = SCENARIOS[0].fen;
    const board = new Chess(fen);
    const move = board.moves({ square: 'e5', verbose: true }).find(({ to }) => to === 'd6');
    expect(move.flags).toContain('e');
    expect(capturedSquareFor(move)).toBe('d5');

    const registry = {
      e5: { id: 'w-p-e5', type: 'p', color: 'w', square: 'e5' },
      d5: { id: 'b-p-d5', type: 'p', color: 'b', square: 'd5', speedPoints: 10 },
    };
    const remote = {
      from: 'e5', to: 'd6',
      candidates: [{ from: 'e5', to: 'd6', chessScoreCp: 25, isLegal: true }],
    };
    const measured = annotateCombatCandidates(fen, registry, remote).candidates[0];
    expect(measured).toMatchObject({ combatReady: true, enemyValue: 1 });
    expect(measured.hitChance).toBeGreaterThanOrEqual(0.5);
    expect(measured.hitChance).toBeLessThan(1);

    const missingDefender = annotateCombatCandidates(fen, { e5: registry.e5 }, remote).candidates[0];
    expect(missingDefender.combatReady).not.toBe(true);
  });

  it('capturar para escapar del jaque siempre conecta aunque el defensor tenga máxima evasión', () => {
    const fen = SCENARIOS[1].fen;
    expect(new Chess(fen).isCheck()).toBe(true);
    expect(isForcedCombatCapture(fen, 'c3', 'h8')).toBe(true);

    const registry = {
      c3: { id: 'w-b-c3', type: 'b', color: 'w', square: 'c3' },
      h8: { id: 'b-r-h8', type: 'r', color: 'b', square: 'h8', speedPoints: 1000 },
    };
    const remote = {
      from: 'c3', to: 'h8',
      candidates: [{ from: 'c3', to: 'h8', chessScoreCp: 10, isLegal: true }],
    };
    const capture = annotateCombatCandidates(fen, registry, remote).candidates[0];
    expect(capture).toMatchObject({ combatReady: true, enemyValue: 5, hitChance: 1 });
  });

  it('las cuatro coronaciones son legales y la CPU local no inventa una quinta', () => {
    const fen = SCENARIOS[2].fen;
    const options = new Chess(fen).moves({ square: 'a7', verbose: true })
      .filter(({ to }) => to === 'a8').map(({ promotion }) => promotion).sort();
    expect(options).toEqual(['b', 'n', 'q', 'r']);
    expect(isLegalCombatCpuSuggestion(fen, { from: 'a7', to: 'a8', promotion: 'k' })).toBe(false);
    expect(emergencyCombatCpuSuggestion(fen)).toMatchObject({ from: 'a7', to: 'a8', promotion: 'q' });
  });

  it('el fallback sigue entregando jugadas legales ante una caída remota en cada posición', async () => {
    for (const { title, fen } of SCENARIOS) {
      const result = await resolveCombatCpuTurnSuggestion({
        fen, difficulty: 30, analyzePosition: async () => { throw new Error('Workers sin respuesta'); },
      });
      expect(result.source, title).toBe('local');
      expect(isLegalCombatCpuSuggestion(fen, result.suggestion), title).toBe(true);
    }
    expect(emergencyCombatCpuSuggestion('FEN roto')).toBeNull();
  });
});
