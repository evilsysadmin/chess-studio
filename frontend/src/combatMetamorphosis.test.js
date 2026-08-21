import { describe, expect, it } from 'vitest';
import {
  applyRosterMetamorphosesToPosition,
  setRosterDeploymentType,
  unlockedDeploymentTypes,
} from './combatMetamorphosis.js';

const commanderPawn = { strengthPoints: 4, speedPoints: 3, bankedXp: 4, alive: true }; // nivel 8
const colonelPawn = { strengthPoints: 5, speedPoints: 4, bankedXp: 4, alive: true }; // nivel 10
const generalPawn = { strengthPoints: 6, speedPoints: 5, bankedXp: 4, alive: true }; // nivel 12

describe('metamorfosis táctica de Combate', () => {
  it('empieza tarde y abre opciones por rango', () => {
    expect(unlockedDeploymentTypes('p-a', { ...commanderPawn, speedPoints: 2 })).toEqual(['p']); // nivel 7
    expect(unlockedDeploymentTypes('p-a', commanderPawn)).toEqual(['p', 'n']);
    expect(unlockedDeploymentTypes('p-a', colonelPawn)).toEqual(['p', 'n', 'b']);
    expect(unlockedDeploymentTypes('p-a', generalPawn)).toEqual(['p', 'n', 'b', 'r']);
    expect(unlockedDeploymentTypes('n-b', generalPawn)).toEqual(['n']);
  });

  it('permite cambiar el loadout antes de cada batalla y volver a la clase original', () => {
    const roster = { pieces: { 'p-a': colonelPawn }, identities: {}, combatXp: 12, revivesUsed: 0 };
    const knight = setRosterDeploymentType(roster, 'p-a', 'n');
    expect(knight.pieces['p-a'].deploymentType).toBe('n');
    const bishop = setRosterDeploymentType(knight, 'p-a', 'b');
    expect(bishop.pieces['p-a'].deploymentType).toBe('b');
    const original = setRosterDeploymentType(bishop, 'p-a', 'p');
    expect(original.pieces['p-a'].deploymentType).toBeNull();
  });

  it('rechaza formas que el rango todavía no ha desbloqueado', () => {
    const roster = { pieces: { 'p-a': commanderPawn }, identities: {}, combatXp: 0 };
    expect(setRosterDeploymentType(roster, 'p-a', 'b')).toBe(roster);
    expect(setRosterDeploymentType(roster, 'p-a', 'r')).toBe(roster);
  });

  it('cambia la clase del tablero pero conserva el id de origen', () => {
    const board = new Map([['a2', { type: 'p', color: 'w' }]]);
    const chess = {
      get: (sq) => board.get(sq) || null,
      remove: (sq) => { const old = board.get(sq); board.delete(sq); return old; },
      put: (piece, sq) => { board.set(sq, piece); return true; },
    };
    const registry = { a2: { id: 'w-p-a2', type: 'p', color: 'w', square: 'a2', alias: 'Starky' } };
    const roster = { pieces: { 'p-a': { ...colonelPawn, deploymentType: 'b' } } };
    const next = applyRosterMetamorphosesToPosition(chess, registry, roster, 'w');
    expect(board.get('a2')).toEqual({ type: 'b', color: 'w' });
    expect(next.a2).toMatchObject({ id: 'w-p-a2', type: 'b', deploymentType: 'b', alias: 'Starky' });
  });
});
