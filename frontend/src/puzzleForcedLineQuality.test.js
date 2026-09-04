import { describe, expect, it } from 'vitest';
import { PUZZLES } from './puzzles.js';
import { curatedForcedLineOptimalityIssues } from './puzzleForcedLineQuality.js';

describe('puzzle massacre · defensa óptima', () => {
  it.each(PUZZLES.filter((puzzle) => ['mate1', 'mate2', 'mate3', 'combination'].includes(puzzle.kind)))(
    '$id almacena una línea contra defensa óptima',
    (puzzle) => {
      expect(
        curatedForcedLineOptimalityIssues(puzzle),
        `${puzzle.id}: la variante guardada no representa juego óptimo de ambos bandos`,
      ).toEqual([]);
    },
  );
});
