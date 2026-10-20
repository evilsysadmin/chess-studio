import { describe, expect, it } from 'vitest';
import { combatDoctrineBonusForMove, doctrineIntelView, enemyDoctrineCatalog, enemyDoctrineForNode } from './combatEnemyDoctrine.js';

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

  it('aplica sesgos tácticos discretos y acotados basados en jugadas reales', () => {
    const pressure = enemyDoctrineCatalog().find((item) => item.id === 'pressure');
    const fortress = enemyDoctrineCatalog().find((item) => item.id === 'fortress');
    const rookCheck = { piece: 'r', captured: undefined, san: 'Rh8+', flags: 'n' };
    expect(combatDoctrineBonusForMove(pressure, rookCheck)).toBe(3);
    expect(combatDoctrineBonusForMove(pressure, { ...rookCheck, san: 'Rb8' })).toBe(0);
    expect(combatDoctrineBonusForMove(fortress, { piece: 'q', san: 'Qh4', flags: 'n' })).toBeLessThan(0);
    expect(combatDoctrineBonusForMove({ style: { capture: 100, check: 100, pawn: 100 } }, {
      piece: 'p', captured: 'q', flags: 'c', san: 'exd6+',
    })).toBe(6);
    expect(combatDoctrineBonusForMove(null, rookCheck)).toBe(0);
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
