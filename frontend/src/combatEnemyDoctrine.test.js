import { describe, expect, it } from 'vitest';
import { doctrineIntelView, enemyDoctrineCatalog, enemyDoctrineForNode } from './combatEnemyDoctrine.js';

describe('doctrinas enemigas de Combat Chess', () => {
  const node = { id: 's4-l1-battle', type: 'battle' };

  it('son deterministas por campaña y sector', () => {
    expect(enemyDoctrineForNode('alpha', node).id).toBe('queen-hunter');
  });

  it('usan únicamente sesgos acotados que el motor ya sabe aplicar', () => {
    for (const doctrine of enemyDoctrineCatalog()) {
      expect(Object.keys(doctrine.style).sort()).toEqual(['capture', 'castle', 'check', 'pawn', 'queen']);
      for (const value of Object.values(doctrine.style)) expect(value).toBeGreaterThanOrEqual(-1);
      for (const value of Object.values(doctrine.style)) expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('Intel revela progresivamente identidad, tendencia y contramedida', () => {
    const doctrine = enemyDoctrineForNode('bravo', node);
    expect(doctrineIntelView(doctrine, 0)).toEqual({ label: null, summary: null, counter: null });
    expect(doctrineIntelView(doctrine, 1).label).toBe(doctrine.label);
    expect(doctrineIntelView(doctrine, 1).summary).toBeNull();
    expect(doctrineIntelView(doctrine, 2).summary).toBe(doctrine.summary);
    expect(doctrineIntelView(doctrine, 3).counter).toBe(doctrine.counter);
  });
});
