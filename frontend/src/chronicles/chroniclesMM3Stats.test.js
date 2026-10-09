import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_MM3_STATS,
  CHRONICLES_MM3_RESISTANCES,
  chroniclesMM3StatSnapshot,
} from './chroniclesMM3Stats.js';

describe('Chronicles MM3 stat compatibility contract', () => {
  it('defines the exact seven MM3 primary stats and six resistances', () => {
    expect(CHRONICLES_MM3_STATS.map((stat) => stat.id)).toEqual([
      'might', 'intellect', 'personality', 'endurance', 'speed', 'accuracy', 'luck',
    ]);
    expect(CHRONICLES_MM3_RESISTANCES).toEqual([
      'fire', 'cold', 'electricity', 'poison-acid', 'energy', 'magic',
    ]);
  });

  it('projects legacy bonuses without inventing intellect, personality or luck', () => {
    const old = { attributes: { vigor: 2, power: 3, precision: 1, agility: 4, will: 5 } };
    const copy = JSON.stringify(old);
    expect(chroniclesMM3StatSnapshot(old)).toEqual({
      schema: 'legacy-v1-projection',
      attributes: {
        might: 13, intellect: 10, personality: 10,
        endurance: 12, speed: 14, accuracy: 11, luck: 10,
      },
    });
    expect(JSON.stringify(old)).toBe(copy);
  });

  it('reads explicit versioned stats without double counting legacy progression', () => {
    const legacy = { attributes: { agility: 5, power: 5 } };
    const projected = chroniclesMM3StatSnapshot(legacy, {
      might: 17, intellect: 12, personality: 13,
      endurance: 20, speed: 19, accuracy: 15, luck: 8,
    });
    expect(projected.schema).toBe('mm3-v2');
    expect(projected.attributes.speed).toBe(19);
    expect(projected.attributes.might).toBe(17);
    expect(chroniclesMM3StatSnapshot(legacy).attributes.speed).toBe(15);
  });

  it('normalizes bad legacy and versioned values without throwing or propagating NaN', () => {
    expect(chroniclesMM3StatSnapshot({ attributes: {
      agility: 99, precision: -1, power: 2.5, vigor: '4',
    } }).attributes).toEqual({
      might: 10, intellect: 10, personality: 10,
      endurance: 10, speed: 10, accuracy: 10, luck: 10,
    });
    const next = chroniclesMM3StatSnapshot(null, { speed: Infinity, luck: -2, might: 44 });
    expect(next.attributes).toMatchObject({ speed: 10, luck: 10, might: 44 });
    expect(Object.isFrozen(next.attributes)).toBe(true);
  });
});
