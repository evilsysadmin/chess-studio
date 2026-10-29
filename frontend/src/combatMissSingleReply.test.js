import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { hitChance, passTurnFen, resolveCombatMove } from './combat.js';
import { emergencyCombatMissExposurePenalty } from './combatControllerSupport.js';

// Tras b6xa5 fallido el caballo de a5 puede capturar la torre de b7
// O la dama de c4, pero nunca las dos en la misma réplica.
const FEN = '7k/1r6/1p6/N7/2q5/8/8/7K b - - 0 1';
const REGISTRY = {
  h8: { id: 'b-k-h8', square: 'h8', color: 'b', type: 'k' },
  b7: { id: 'b-r-b7', square: 'b7', color: 'b', type: 'r' },
  b6: { id: 'b-p-b6', square: 'b6', color: 'b', type: 'p' },
  c4: { id: 'b-q-c4', square: 'c4', color: 'b', type: 'q' },
  a5: { id: 'w-n-a5', square: 'a5', color: 'w', type: 'n' },
  h1: { id: 'w-k-h1', square: 'h1', color: 'w', type: 'k' },
};
const MISS_CHANCE = 0.4;

describe('Combat · una sola réplica enemiga tras un fallo', () => {
  it('no suma amenazas a dama y torre: toma el peor riesgo de captura legal', () => {
    const chess = new Chess(FEN);
    const capture = chess.moves({ square: 'b6', verbose: true })
      .find(({ to, captured }) => to === 'a5' && captured === 'n');
    expect(capture).toBeTruthy();
    const afterMiss = new Chess(passTurnFen(FEN));
    const alternatives = afterMiss.moves({ square: 'a5', verbose: true })
      .filter(({ captured }) => captured === 'q' || captured === 'r')
      .map(({ to, captured }) => ({ to, captured }));
    expect(alternatives).toEqual(expect.arrayContaining([
      { to: 'c4', captured: 'q' },
      { to: 'b7', captured: 'r' },
    ]));
    expect(alternatives).toHaveLength(2);

    const queenThreat = hitChance(REGISTRY.a5, REGISTRY.c4) * 190;
    const rookThreat = hitChance(REGISTRY.a5, REGISTRY.b7) * 150;
    const measured = emergencyCombatMissExposurePenalty(FEN, capture, REGISTRY, {}, MISS_CHANCE);
    expect(measured).toBeCloseTo(MISS_CHANCE * Math.max(queenThreat, rookThreat), 6);
    expect(measured).toBeLessThan(MISS_CHANCE * (queenThreat + rookThreat));
    expect(measured).toBeLessThanOrEqual(MISS_CHANCE * 190);
    expect(REGISTRY.a5.square).toBe('a5');
  });

  it('si la identidad de una víctima no está acreditada, conserva sólo la amenaza conocida', () => {
    const move = new Chess(FEN).moves({ square: 'b6', verbose: true })
      .find(({ to }) => to === 'a5');
    const withoutQueen = { ...REGISTRY };
    delete withoutQueen.c4;
    expect(emergencyCombatMissExposurePenalty(FEN, move, withoutQueen, {}, MISS_CHANCE))
      .toBeCloseTo(MISS_CHANCE * hitChance(REGISTRY.a5, REGISTRY.b7) * 150, 6);

    const staleQueen = { ...REGISTRY, c4: { ...REGISTRY.c4, square: 'd4' } };
    expect(emergencyCombatMissExposurePenalty(FEN, move, staleQueen, {}, MISS_CHANCE))
      .toBeCloseTo(MISS_CHANCE * hitChance(REGISTRY.a5, REGISTRY.b7) * 150, 6);

    const withoutBoth = { ...withoutQueen };
    delete withoutBoth.b7;
    expect(emergencyCombatMissExposurePenalty(FEN, move, withoutBoth, {}, MISS_CHANCE)).toBe(0);

    const hit = resolveCombatMove({ fen: FEN, registry: REGISTRY, from: 'b6', to: 'a5', randomFn: () => 0 });
    expect(hit.hit).toBe(true);
    expect(hit.registry.a5).toMatchObject({ id: 'b-p-b6', type: 'p' });
    expect(new Chess(hit.fen).moves({ square: 'a5', verbose: true })
      .some(({ to }) => to === 'b7' || to === 'c4')).toBe(false);
  });
});
