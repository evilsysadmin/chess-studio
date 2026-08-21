import { describe, expect, it } from 'vitest';
import {
  PAWN_METAMORPHOSIS_CHOICES,
  applyRosterMetamorphosesToPosition,
  canMetamorphoseRosterPiece,
  metamorphoseRosterPiece,
} from './combatMetamorphosis.js';

const captainPawn = { strengthPoints: 3, speedPoints: 2, bankedXp: 4, alive: true };

describe('metamorfosis de veteranos', () => {
  it('solo permite peones Capitán o superiores', () => {
    expect(canMetamorphoseRosterPiece('p-a', captainPawn)).toBe(true);
    expect(canMetamorphoseRosterPiece('p-a', { ...captainPawn, speedPoints: 1 })).toBe(false);
    expect(canMetamorphoseRosterPiece('n-b', captainPawn)).toBe(false);
  });

  it('es una elección de una sola vía y conserva veteranía', () => {
    const roster = { pieces: { 'p-a': captainPawn }, combatXp: 12, revivesUsed: 0 };
    const evolved = metamorphoseRosterPiece(roster, 'p-a', 'n');
    expect(evolved.pieces['p-a']).toMatchObject({ metamorphosis: 'n', strengthPoints: 3, speedPoints: 2, bankedXp: 4, alive: true });
    expect(metamorphoseRosterPiece(evolved, 'p-a', 'b')).toBe(evolved);
    expect(PAWN_METAMORPHOSIS_CHOICES).toEqual(['n', 'b']);
  });

  it('cambia la clase del tablero pero mantiene el id de origen del veterano', () => {
    const board = new Map([['a2', { type: 'p', color: 'w' }]]);
    const chess = {
      get: (sq) => board.get(sq) || null,
      remove: (sq) => { const old = board.get(sq); board.delete(sq); return old; },
      put: (piece, sq) => { board.set(sq, piece); return true; },
    };
    const registry = { a2: { id: 'w-p-a2', type: 'p', color: 'w', square: 'a2' } };
    const roster = { pieces: { 'p-a': { ...captainPawn, metamorphosis: 'b' } } };
    const next = applyRosterMetamorphosesToPosition(chess, registry, roster, 'w');
    expect(board.get('a2')).toEqual({ type: 'b', color: 'w' });
    expect(next.a2).toMatchObject({ id: 'w-p-a2', type: 'b', metamorphosis: 'b' });
  });
});
