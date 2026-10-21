import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { passTurnFen, resolveCombatMove } from './combat.js';
import { emergencyCombatMissExposurePenalty } from './combatControllerSupport.js';

describe('Combat Chess · fallos en capturas especiales', () => {
  it('si falla una captura con promoción el peón no se convierte, y puede ser atacado en su origen', () => {
    const fen = '7k/8/8/8/8/8/1p6/Q6K b - - 0 1';
    const registry = {
      h8: { id: 'b-k-h8', type: 'k', color: 'b', square: 'h8' },
      b2: { id: 'b-p-b2', type: 'p', color: 'b', square: 'b2' },
      a1: { id: 'w-q-a1', type: 'q', color: 'w', square: 'a1' },
      h1: { id: 'w-k-h1', type: 'k', color: 'w', square: 'h1' },
    };
    const capture = new Chess(fen).moves({ square: 'b2', verbose: true })
      .find(({ to, promotion, captured }) => to === 'a1' && promotion === 'q' && captured === 'q');
    expect(capture).toBeTruthy();

    const miss = resolveCombatMove({
      fen, registry, from: 'b2', to: 'a1', promotion: 'q', randomFn: () => 0.99,
    });
    expect(miss.hit).toBe(false);
    expect(miss.fen).toBe(passTurnFen(fen));
    expect(miss.registry.b2).toMatchObject({ type: 'p', square: 'b2' });
    expect(miss.registry.a1).toMatchObject({ type: 'q', color: 'w', square: 'a1' });
    expect(new Chess(miss.fen).moves({ square: 'a1', verbose: true })
      .some(({ to, captured }) => to === 'b2' && captured === 'p')).toBe(true);

    // La rama fallida amenaza al peón de origen, nunca a una dama
    // imaginaria en a1; no se descarta sólo porque hubo promoción.
    const risk = emergencyCombatMissExposurePenalty(fen, capture, registry, {}, 1 - miss.chance);
    expect(risk).toBeGreaterThan(0);
    expect(risk).toBeLessThan(120);
    expect(emergencyCombatMissExposurePenalty(fen, capture, registry, {}, 0)).toBe(0);

    const hit = resolveCombatMove({
      fen, registry, from: 'b2', to: 'a1', promotion: 'q', randomFn: () => 0,
    });
    expect(hit.hit).toBe(true);
    expect(hit.registry.b2).toBeUndefined();
    expect(hit.registry.a1).toMatchObject({ type: 'q', color: 'b', square: 'a1' });
  });

  it('si falla una captura al paso, conserva ambos peones pero caduca ese derecho', () => {
    const fen = '7k/8/8/3pP3/8/8/8/7K w - d6 0 1';
    const registry = {
      h8: { id: 'b-k-h8', type: 'k', color: 'b', square: 'h8' },
      d5: { id: 'b-p-d5', type: 'p', color: 'b', square: 'd5' },
      e5: { id: 'w-p-e5', type: 'p', color: 'w', square: 'e5' },
      h1: { id: 'w-k-h1', type: 'k', color: 'w', square: 'h1' },
    };
    const move = new Chess(fen).moves({ square: 'e5', verbose: true })
      .find(({ to, flags }) => to === 'd6' && flags.includes('e'));
    expect(move).toBeTruthy();

    const miss = resolveCombatMove({
      fen, registry, from: 'e5', to: 'd6', randomFn: () => 0.99,
    });
    expect(miss.hit).toBe(false);
    expect(miss.fen).toBe(passTurnFen(fen));
    expect(miss.fen.split(' ')[1]).toBe('b');
    expect(miss.fen.split(' ')[3]).toBe('-');
    expect(miss.registry.e5).toMatchObject({ type: 'p', color: 'w', square: 'e5' });
    expect(miss.registry.d5).toMatchObject({ type: 'p', color: 'b', square: 'd5' });
    expect(miss.registry.d6).toBeUndefined();
    expect(new Chess(miss.fen).moves({ verbose: true }).some(({ flags }) => flags.includes('e'))).toBe(false);

    const hit = resolveCombatMove({
      fen, registry, from: 'e5', to: 'd6', randomFn: () => 0,
    });
    expect(hit.hit).toBe(true);
    expect(hit.registry.d6).toMatchObject({ type: 'p', color: 'w', square: 'd6' });
    expect(hit.registry.d5).toBeUndefined();
    expect(hit.registry.e5).toBeUndefined();
  });
});
