import { describe, expect, it } from 'vitest';
import { atlasExample, atlasInitialTrail, atlasPosition } from './careerOpeningAtlas.js';

const tree = {
  count: 3, wins: 2,
  children: { e4: { move: 'e4', count: 3, wins: 2, children: {
    e5: { move: 'e5', count: 2, wins: 2, children: {
      Nf3: { move: 'Nf3', count: 2, wins: 2, children: {
        Nc6: { move: 'Nc6', count: 2, wins: 2, children: {} },
      } },
    } },
    c5: { move: 'c5', count: 1, wins: 0, children: {} },
  } } },
};

describe('Career opening atlas is built only from legal saved paths', () => {
  it('shows actual frequency and valid FEN for each recorded ply', () => {
    expect(atlasInitialTrail(tree)).toEqual(['e4']);
    const first = atlasPosition(tree, ['e4']);
    expect(first?.count).toBe(3);
    expect(first?.wins).toBe(2);
    expect(first?.choices).toEqual([{san:'e5',count:2,wins:2},{san:'c5',count:1,wins:0}]);
    expect(first?.fen).toContain(' b KQkq ');
    const second = atlasPosition(tree, ['e4','e5','Nf3']);
    expect(second?.fen).toContain(' b KQkq ');
    expect(second?.choices).toHaveLength(0);
  });
  it('rejects illegal, fabricated or deeper-than-three variations', () => {
    expect(atlasPosition(tree, ['d4'])).toBeNull();
    expect(atlasPosition(tree, ['e4','e5','Qa4'])).toBeNull();
    expect(atlasPosition(tree, ['e4','e5','Nf3','Nc6'])).toBeNull();
    expect(atlasPosition({count:1,children:{Qh5:{move:'Qh5',count:1}}},['Qh5'])).toBeNull();
    expect(atlasPosition(null, [])).toBeNull();
  });
  it('uses only explicit archived games matching every displayed move', () => {
    const history=[
      {id:'a',date:'2026-01-01',moves:['e4','c5','Nf3']},
      {id:'b',date:'2026-02-01',moves:['e4','e5','Nf3']},
      {date:'2026-03-01',moves:['e4','e5','Nf3']},
    ];
    expect(atlasExample(history,['e4','e5']).id).toBe('b');
    expect(atlasExample(history,['d4'])).toBeNull();
    expect(atlasExample(history,[])).toBeNull();
  });
});
