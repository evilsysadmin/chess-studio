import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { passTurnFen, resolveCombatMove } from './combat.js';
import {
  emergencyCombatCpuSuggestion, emergencyCombatMissExposurePenalty,
  isLegalCombatCpuSuggestion, resolveCombatCpuTurnSuggestion,
} from './combatControllerSupport.js';

// La dama puede comerse el peón en c5. Pero, si falla, c5xb6 captura a
// la dama QUE NO SE HA MOVIDO. Esa amenaza no existe si la captura acierta.
const FEN = '4k3/8/1q6/2P5/8/8/8/6BK b - - 0 1';
const REGISTRY = {
  e8: { id: 'b-k-e8', color: 'b', type: 'k', square: 'e8' },
  b6: { id: 'b-q-b6', color: 'b', type: 'q', square: 'b6' },
  c5: { id: 'w-p-c5', color: 'w', type: 'p', square: 'c5', runSpeedBonus: 20 },
  g1: { id: 'w-b-g1', color: 'w', type: 'b', square: 'g1' },
  h1: { id: 'w-k-h1', color: 'w', type: 'k', square: 'h1' },
};

describe('Combat Chess · captura fallida y amenaza en casilla original', () => {
  it('el FEN real después del fallo conserva dama y peón, y da turno a blancas', () => {
    const board = new Chess(FEN);
    const move = board.moves({ square: 'b6', verbose: true })
      .find(({ to, captured }) => to === 'c5' && captured === 'p');
    expect(move).toBeTruthy();

    const success = resolveCombatMove({
      fen: FEN, registry: REGISTRY, from: 'b6', to: 'c5', randomFn: () => 0,
    });
    const miss = resolveCombatMove({
      fen: FEN, registry: REGISTRY, from: 'b6', to: 'c5', randomFn: () => 0.99,
    });
    expect(success.hit).toBe(true);
    expect(miss.hit).toBe(false);
    expect(miss.fen).toBe(passTurnFen(FEN));
    expect(miss.registry.b6).toMatchObject({ id: REGISTRY.b6.id, square: 'b6' });
    expect(miss.registry.c5).toMatchObject({ id: REGISTRY.c5.id, square: 'c5' });
    expect(success.registry.c5).toMatchObject({ id: REGISTRY.b6.id, square: 'c5' });
    expect(success.registry.b6).toBeUndefined();
    expect(new Chess(miss.fen).moves({ square: 'c5', verbose: true })
      .some(({ to, captured }) => to === 'b6' && captured === 'q')).toBe(true);
    expect(new Chess(success.fen).moves({ square: 'c5', verbose: true })
      .some(({ to, captured }) => to === 'b6' && captured === 'q')).toBe(false);

    const weighted = emergencyCombatMissExposurePenalty(FEN, move, REGISTRY, {}, 1 - miss.chance);
    expect(weighted).toBeGreaterThan(0);
    expect(weighted).toBeLessThan(190);
    expect(emergencyCombatMissExposurePenalty(FEN, move, REGISTRY, {}, 0)).toBe(0);
    expect(REGISTRY.b6.square).toBe('b6');
    expect(REGISTRY.c5.square).toBe('c5');
  });

  it('sólo mide ataques demostrados: no inventa riesgos sin datos o con square corrupto', () => {
    const move = new Chess(FEN).moves({ square: 'b6', verbose: true })
      .find(({ to }) => to === 'c5');
    expect(emergencyCombatMissExposurePenalty(FEN, move, REGISTRY, {}, 0.4)).toBeGreaterThan(0);
    const noDefender = { ...REGISTRY };
    delete noDefender.c5;
    expect(emergencyCombatMissExposurePenalty(FEN, move, noDefender, {}, 0.4)).toBe(0);
    const staleDefender = { ...REGISTRY, c5: { ...REGISTRY.c5, square: 'c4' } };
    expect(emergencyCombatMissExposurePenalty(FEN, move, staleDefender, {}, 0.4)).toBe(0);
    const staleAttacker = { ...REGISTRY, b6: { ...REGISTRY.b6, square: 'b5' } };
    expect(emergencyCombatMissExposurePenalty(FEN, move, staleAttacker, {}, 0.4)).toBe(0);
    expect(emergencyCombatMissExposurePenalty('FEN inválido', move, REGISTRY, {}, 0.4)).toBe(0);
  });

  it('el fallback de Workers no persigue una captura que deja la dama en peligro tras fallar', async () => {
    const legacy = emergencyCombatCpuSuggestion(FEN);
    expect(legacy).toMatchObject({ from: 'b6', to: 'c5' });
    const measured = emergencyCombatCpuSuggestion(FEN, REGISTRY);
    expect(measured).not.toMatchObject({ from: 'b6', to: 'c5' });
    expect(isLegalCombatCpuSuggestion(FEN, measured)).toBe(true);
    const recovered = await resolveCombatCpuTurnSuggestion({
      fen: FEN, difficulty: 40, registry: REGISTRY,
      analyzePosition: async () => { throw new Error('Workers no disponible'); },
    });
    expect(recovered.source).toBe('local');
    expect(recovered.suggestion).toEqual(measured);
  });

  it('mantiene prioridad del mate y el paso al turno contrario no crea al paso fantasma', () => {
    const fen = '7k/8/8/3pP3/8/8/8/7K w - d6 0 1';
    expect(passTurnFen(fen).split(' ')[3]).toBe('-');
    const mateFen = '7k/8/5KQ1/8/8/8/8/8 w - - 0 1';
    expect(emergencyCombatCpuSuggestion(mateFen)).toMatchObject({ from: 'g6', to: 'g7' });
  });
});
