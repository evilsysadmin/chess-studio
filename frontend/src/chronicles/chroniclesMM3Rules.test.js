import { describe, expect, it } from 'vitest';
import {
  chroniclesPartyArmorClass,
  chroniclesPartyAttackStats,
  chroniclesReduce,
  createChroniclesState,
} from '../chroniclesOfMatthias.js';
import { chroniclesApplyContentEffects } from './chroniclesContentRuntime.js';
import { chroniclesPartyInitiativeAgility } from './chroniclesInitiative.js';
import {
  CHRONICLES_MM3_CLASS_IDS,
  chroniclesMM3AttackHits,
  chroniclesMM3Derived,
  chroniclesMM3Roll,
  chroniclesMM3StatBonus,
  chroniclesMM3UnmetRequirements,
} from './chroniclesMM3Rules.js';

describe('Chronicles MM3 rules', () => {
  it('uses the MM3 stat-bonus bands', () => {
    expect([3, 5, 7, 9, 11, 13, 15, 17, 18].map(chroniclesMM3StatBonus)).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 3]);
  });

  it('ships the ten MM3 classes with their minimums and HP per level', () => {
    expect(CHRONICLES_MM3_CLASS_IDS).toEqual([
      'knight', 'paladin', 'archer', 'cleric', 'sorcerer', 'robber', 'ninja', 'barbarian', 'druid', 'ranger',
    ]);
    expect(chroniclesMM3UnmetRequirements('knight', { might: 14 })).toEqual([{ stat: 'might', need: 15, have: 14 }]);
    expect(chroniclesMM3Derived('barbarian', { endurance: 15 }).maxHp).toBe(14);
    expect(chroniclesMM3Derived('sorcerer', { endurance: 5 }).maxHp).toBe(1);
  });

  it('rolls a deterministic d20 per moment: natural 20 hits, natural 1 misses', () => {
    const state = { runSeed: 'run-1', mapId: 'banner-road-first-book', turns: 4 };
    const roll = chroniclesMM3Roll(state, 'party', 'matthias');
    expect(roll).toBe(chroniclesMM3Roll(state, 'party', 'matthias'));
    expect(roll).toBeGreaterThanOrEqual(1);
    expect(roll).toBeLessThanOrEqual(20);
    expect(chroniclesMM3AttackHits(20, -10, 30)).toBe(true);
    expect(chroniclesMM3AttackHits(1, 30, 0)).toBe(false);
    expect(chroniclesMM3AttackHits(8, 2, 0)).toBe(true);
    expect(chroniclesMM3AttackHits(8, 1, 0)).toBe(false);
  });

  it('wires Accuracy, Speed and Luck into first-person numbers', () => {
    const state = createChroniclesState('banner-road-first-book', null, { rules: 'mm3' });
    // Canonical Faust (Arquero): Precisión 15 (+2) at level 1; Velocidad 14 (+1).
    expect(chroniclesPartyAttackStats(state, 'knight').toHit).toBe(3);
    expect(chroniclesPartyArmorClass(state, 'knight')).toBe(1);
    const faust = state.party.find((member) => member.id === 'knight');
    expect(chroniclesPartyInitiativeAgility(state, faust)).toBe(faust.agility + 1);

    // Luck halves trap damage on a successful save; without MM3 rules it never does.
    const hits = (rules) => {
      const base = createChroniclesState('banner-road-first-book', null, rules ? { rules: 'mm3' } : undefined);
      let saved = 0;
      for (let turns = 0; turns < 40; turns += 1) {
        const after = chroniclesApplyContentEffects({ ...base, turns }, [{ type: 'damage-party', amount: 4 }]);
        saved += after.party.filter((member, index) => base.party[index].hp - member.hp === 2).length;
      }
      return saved;
    };
    expect(hits(false)).toBe(0);
    expect(hits(true)).toBeGreaterThan(0);
  });

  it('lets attacks miss under MM3 rules and keeps the legacy deterministic hit elsewhere', () => {
    const at = (rules, turns) => ({
      ...createChroniclesState('banner-road-first-book', null, rules ? { rules: 'mm3' } : undefined),
      x: 10, y: 5, direction: 1, turns, runSeed: 'seed',
    });
    let misses = 0;
    let hits = 0;
    for (let turns = 0; turns < 60; turns += 1) {
      const before = at(true, turns);
      const after = chroniclesReduce(before, { type: 'attack', memberId: 'matthias' });
      if (after.bannerRoadDeserterHp === before.bannerRoadDeserterHp) {
        misses += 1;
        expect(after.message).toMatch(/falla/);
      } else hits += 1;
    }
    expect(misses).toBeGreaterThan(0);
    expect(hits).toBeGreaterThan(misses);

    for (let turns = 0; turns < 20; turns += 1) {
      const before = at(false, turns);
      const after = chroniclesReduce(before, { type: 'attack', memberId: 'matthias' });
      expect(after.bannerRoadDeserterHp).toBeLessThan(before.bannerRoadDeserterHp);
    }
  });
});
