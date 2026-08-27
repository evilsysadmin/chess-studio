import { describe, expect, it } from 'vitest';
import {
  techniqueTargetsFor,
  unlockRosterTechnique,
  setRosterEquippedTechnique,
  resolveTechniqueAttack,
} from './combatTechniques.js';

describe('técnicas especiales de Combate', () => {
  const colonelPawn = { strengthPoints: 5, speedPoints: 4, bankedXp: 30, alive: true }; // nivel 10

  it('exige rango alto y XP para desbloquear Fuego de línea', () => {
    const lowRank = { pieces: { 'p-a': { strengthPoints: 3, speedPoints: 3, bankedXp: 99, alive: true } } };
    expect(unlockRosterTechnique(lowRank, 'p-a', 'line_fire')).toBe(lowRank);

    const roster = { pieces: { 'p-a': colonelPawn } };
    const unlocked = unlockRosterTechnique(roster, 'p-a', 'line_fire');
    expect(unlocked.pieces['p-a'].bankedXp).toBe(12);
    expect(unlocked.pieces['p-a'].unlockedTechniques).toContain('line_fire');
    expect(unlocked.pieces['p-a'].equippedTechnique).toBe('line_fire');
  });

  it('sólo equipa técnicas previamente desbloqueadas', () => {
    const roster = { pieces: { 'p-a': { ...colonelPawn, unlockedTechniques: ['line_fire'] } } };
    expect(setRosterEquippedTechnique(roster, 'p-a', 'line_fire').pieces['p-a'].equippedTechnique).toBe('line_fire');
    expect(setRosterEquippedTechnique(roster, 'p-a', 'inventada')).toBe(roster);
  });

  it('Fuego de línea sólo ofrece capturas ortogonales a máximo tres casillas', () => {
    const fen = '4k3/8/8/8/r7/8/P7/4K3 w - - 0 1';
    const registry = {
      a2: { id: 'w-p-a2', type: 'p', color: 'w', square: 'a2', strengthPoints: 5, speedPoints: 4, bankedXp: 0, unlockedTechniques: ['line_fire'], equippedTechnique: 'line_fire', techniqueUsed: false },
      a4: { id: 'b-r-a8', type: 'r', color: 'b', square: 'a4', strengthPoints: 0, speedPoints: 0, bankedXp: 0 },
      e1: { id: 'w-k-e1', type: 'k', color: 'w', square: 'e1', strengthPoints: 0, speedPoints: 0, bankedXp: 0 },
      e8: { id: 'b-k-e8', type: 'k', color: 'b', square: 'e8', strengthPoints: 0, speedPoints: 0, bankedXp: 0 },
    };
    expect(techniqueTargetsFor(fen, registry, 'a2')).toEqual(['a4']);
  });

  it('consume el único uso incluso si el defensor esquiva', () => {
    const fen = '4k3/8/8/8/r7/8/P7/4K3 w - - 0 1';
    const registry = {
      a2: { id: 'w-p-a2', type: 'p', color: 'w', square: 'a2', strengthPoints: 0, speedPoints: 0, bankedXp: 0, unlockedTechniques: ['line_fire'], equippedTechnique: 'line_fire', techniqueUsed: false },
      a4: { id: 'b-r-a8', type: 'r', color: 'b', square: 'a4', strengthPoints: 0, speedPoints: 20, bankedXp: 0 },
      e1: { id: 'w-k-e1', type: 'k', color: 'w', square: 'e1', strengthPoints: 0, speedPoints: 0, bankedXp: 0 },
      e8: { id: 'b-k-e8', type: 'k', color: 'b', square: 'e8', strengthPoints: 0, speedPoints: 0, bankedXp: 0 },
    };
    const result = resolveTechniqueAttack({ fen, registry, from: 'a2', to: 'a4', randomFn: () => 0.999 });
    expect(result.hit).toBe(false);
    expect(result.registry.a2.techniqueUsed).toBe(true);
    expect(result.fen.split(' ')[1]).toBe('b');
  });

  it('al acertar mueve la clase real, no deja una torre fantasma en el FEN', () => {
    const fen = '4k3/8/8/8/r7/8/P7/4K3 w - - 0 1';
    const registry = {
      a2: { id: 'w-p-a2', type: 'p', color: 'w', square: 'a2', strengthPoints: 12, speedPoints: 0, bankedXp: 0, unlockedTechniques: ['line_fire'], equippedTechnique: 'line_fire', techniqueUsed: false },
      a4: { id: 'b-r-a8', type: 'r', color: 'b', square: 'a4', strengthPoints: 0, speedPoints: 0, bankedXp: 0 },
      e1: { id: 'w-k-e1', type: 'k', color: 'w', square: 'e1', strengthPoints: 0, speedPoints: 0, bankedXp: 0 },
      e8: { id: 'b-k-e8', type: 'k', color: 'b', square: 'e8', strengthPoints: 0, speedPoints: 0, bankedXp: 0 },
    };
    const result = resolveTechniqueAttack({ fen, registry, from: 'a2', to: 'a4', randomFn: () => 0 });
    expect(result.hit).toBe(true);
    expect(result.registry.a4.type).toBe('p');
    expect(result.registry.a4.techniqueUsed).toBe(true);
    const board = result.fen.split(' ')[0];
    expect(board).toContain('P');
  });

  it('no permite activar técnicas para escapar de un jaque', () => {
    const fen = '4k3/8/8/8/r7/8/P3r3/4K3 w - - 0 1';
    const registry = {
      a2: { id: 'w-p-a2', type: 'p', color: 'w', square: 'a2', unlockedTechniques: ['line_fire'], equippedTechnique: 'line_fire', techniqueUsed: false },
      a4: { id: 'b-r-a8', type: 'r', color: 'b', square: 'a4' },
      e1: { id: 'w-k-e1', type: 'k', color: 'w', square: 'e1' },
      e2: { id: 'b-r-h8', type: 'r', color: 'b', square: 'e2' },
      e8: { id: 'b-k-e8', type: 'k', color: 'b', square: 'e8' },
    };
    expect(techniqueTargetsFor(fen, registry, 'a2')).toEqual([]);
  });

  it('una posición corrupta no ofrece técnicas ni lanza excepciones', () => {
    const registry = {
      a2: { id: 'w-p-a2', type: 'p', color: 'w', square: 'a2', unlockedTechniques: ['line_fire'], equippedTechnique: 'line_fire', techniqueUsed: false },
    };
    expect(() => techniqueTargetsFor('fen-roto', registry, 'a2')).not.toThrow();
    expect(techniqueTargetsFor('fen-roto', registry, 'a2')).toEqual([]);
    expect(resolveTechniqueAttack({ fen: 'fen-roto', registry, from: 'a2', to: 'a4' })).toBeNull();
  });

});
