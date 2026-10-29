import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { resolveCombatMove, passTurnFen } from './combat.js';
import {
  emergencyCombatCpuSuggestion, emergencyCombatMissExposurePenalty, isLegalCombatCpuSuggestion,
  resolveCombatCpuTurnSuggestion,
} from './combatControllerSupport.js';

// b6xa5 intenta eliminar al caballo que amenaza la dama c4.
// Si falla, el caballo sigue en a5 y puede jugar Nxc4; si acierta,
// el caballo desaparece y esa réplica deja de existir.
const FEN = '7k/8/1p6/N7/2q5/8/8/7K b - - 0 1';
const REGISTRY = {
  h8: { id: 'b-k-h8', square: 'h8', color: 'b', type: 'k' },
  b6: { id: 'b-p-b6', square: 'b6', color: 'b', type: 'p' },
  c4: { id: 'b-q-c4', square: 'c4', color: 'b', type: 'q' },
  a5: { id: 'w-n-a5', square: 'a5', color: 'w', type: 'n' },
  h1: { id: 'w-k-h1', square: 'h1', color: 'w', type: 'k' },
};

describe('Combat · otros aliados expuestos tras un fallo', () => {
  it('un caballo superviviente puede capturar la dama, y deja de amenazarla si muere', () => {
    const capture = new Chess(FEN).moves({ square: 'b6', verbose: true })
      .find(({ to, captured }) => to === 'a5' && captured === 'n');
    expect(capture).toBeTruthy();
    const hit = resolveCombatMove({ fen: FEN, registry: REGISTRY, from: 'b6', to: 'a5', randomFn: () => 0 });
    const miss = resolveCombatMove({ fen: FEN, registry: REGISTRY, from: 'b6', to: 'a5', randomFn: () => 0.99 });
    expect(hit.hit).toBe(true);
    expect(miss.hit).toBe(false);
    expect(miss.fen).toBe(passTurnFen(FEN));
    expect(miss.registry.a5).toMatchObject({ id: 'w-n-a5', square: 'a5' });
    expect(miss.registry.c4).toMatchObject({ id: 'b-q-c4', square: 'c4' });
    expect(new Chess(miss.fen).moves({ square: 'a5', verbose: true })
      .some(({ to, captured }) => to === 'c4' && captured === 'q')).toBe(true);
    expect(hit.registry.a5).toMatchObject({ id: 'b-p-b6', square: 'a5' });
    expect(hit.registry.c4).toMatchObject({ id: 'b-q-c4', square: 'c4' });
    expect(new Chess(hit.fen).moves({ verbose: true })
      .some(({ to, captured }) => to === 'c4' && captured === 'q')).toBe(false);
    const penalty = emergencyCombatMissExposurePenalty(FEN, capture, REGISTRY, {}, 1 - miss.chance);
    expect(penalty).toBeGreaterThan(0);
    expect(penalty).toBeLessThan(190 * (1 - miss.chance));
    expect(emergencyCombatMissExposurePenalty(FEN, capture, REGISTRY, {}, 0)).toBe(0);
  });

  it('protege a la dama en el fallback sin alterar el comportamiento sin registro', async () => {
    const greedy = emergencyCombatCpuSuggestion(FEN);
    expect(greedy).toMatchObject({ from: 'b6', to: 'a5' });
    const cautious = emergencyCombatCpuSuggestion(FEN, REGISTRY);
    expect(cautious).not.toMatchObject({ from: 'b6', to: 'a5' });
    expect(isLegalCombatCpuSuggestion(FEN, cautious)).toBe(true);
    const result = await resolveCombatCpuTurnSuggestion({
      fen: FEN, registry: REGISTRY, difficulty: 45,
      analyzePosition: async () => { throw new Error('Workers desconectado'); },
    });
    expect(result.source).toBe('local');
    expect(result.suggestion).toEqual(cautious);
  });

  it('sin la identidad correcta de la dama o del caballo no se inventa ese riesgo', () => {
    const capture = new Chess(FEN).moves({ square: 'b6', verbose: true })
      .find(({ to }) => to === 'a5');
    const withoutQueen = { ...REGISTRY };
    delete withoutQueen.c4;
    expect(emergencyCombatMissExposurePenalty(FEN, capture, withoutQueen, {}, 0.4)).toBe(0);
    const ghostQueen = { ...REGISTRY, c4: { ...REGISTRY.c4, square: 'd4' } };
    expect(emergencyCombatMissExposurePenalty(FEN, capture, ghostQueen, {}, 0.4)).toBe(0);
    const unknownKnight = { ...REGISTRY };
    delete unknownKnight.a5;
    expect(emergencyCombatMissExposurePenalty(FEN, capture, unknownKnight, {}, 0.4)).toBe(0);
    expect(REGISTRY.c4.square).toBe('c4');
  });
});
