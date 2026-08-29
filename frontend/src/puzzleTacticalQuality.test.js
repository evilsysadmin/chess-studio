import { describe, expect, it } from 'vitest';
import { curatedPuzzleTacticalIssues, isObviouslyUnsoundSingleMovePuzzle } from './puzzleTacticalQuality.js';

describe('calidad táctica mínima de puzzles', () => {
  it('rechaza el clásico jaque bonito cuyo caballo se come un peón inmediatamente', () => {
    const puzzle = {
      fen: '3k4/5p2/8/2N5/8/8/8/4K3 w - - 0 1',
      solution: ['Ne6+'],
      source: 'workers-ai-validated',
    };
    expect(isObviouslyUnsoundSingleMovePuzzle(puzzle)).toBe(true);
  });

  it('no confunde un mate inmediato con una pieza colgada', () => {
    const puzzle = {
      fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
      solution: ['Ra8#'],
      source: 'workers-ai-validated',
    };
    expect(isObviouslyUnsoundSingleMovePuzzle(puzzle)).toBe(false);
  });

  it('rechaza una combinación de dama y torre si el rey puede comerse la torre final', () => {
    const bogusOpera = {
      kind: 'combination',
      fen: '4kb1r/p2n1ppp/4q3/4p3/4P3/1Q6/PPP2PPP/2KR4 w - - 0 16',
      solution: ['Qb8+', 'Nxb8', 'Rd8+'],
    };
    expect(curatedPuzzleTacticalIssues(bogusOpera)).toContain('la clave no fuerza el mate contra la mejor defensa');
  });

  it('rechaza una línea material que depende de que el rival ignore una defensa claramente mejor', () => {
    const cooperativeFork = {
      kind: 'material',
      fen: 'r3r2k/8/8/3N4/8/8/8/6K1 w - - 0 1',
      solution: ['Nc7', 'Kg8', 'Nxa8'],
    };
    expect(curatedPuzzleTacticalIssues(cooperativeFork).length).toBeGreaterThan(0);
  });

});
