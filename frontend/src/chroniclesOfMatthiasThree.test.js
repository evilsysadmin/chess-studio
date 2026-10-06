import { describe, expect, it } from 'vitest';
import { CHRONICLES_MAP } from './chroniclesOfMatthias.js';
import {
  CHRONICLES_TORCH_PLACEMENTS,
  chroniclesContentIdFromObject,
  chroniclesEnemyFacingYaw,
  chroniclesExitGateTransform,
  chroniclesTorchTransform,
} from './chroniclesOfMatthiasThree.js';

const NEIGHBOR = Object.freeze({
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
});

describe('Chronicles of Matthias dungeon photography', () => {
  it('anchors every authored torch to an actual wall beside a walkable cell', () => {
    expect(CHRONICLES_TORCH_PLACEMENTS).toHaveLength(8);
    CHRONICLES_TORCH_PLACEMENTS.forEach(({ x, y, side }) => {
      const [dx, dy] = NEIGHBOR[side];
      expect(CHRONICLES_MAP[y]?.[x]).not.toBe('#');
      expect(CHRONICLES_MAP[y + dy]?.[x + dx]).toBe('#');
    });
  });

  it('moves wall torches off the cell centre and faces their flame back into the corridor', () => {
    const west = chroniclesTorchTransform(1, 5, 'west');
    const east = chroniclesTorchTransform(5, 5, 'east');
    const north = chroniclesTorchTransform(2, 1, 'north');

    expect(west.position.x).toBeLessThan(-8);
    expect(west.yaw).toBe(0);
    expect(east.position.x).toBeGreaterThan(8);
    expect(east.yaw).toBe(Math.PI);
    expect(north.position.z).toBeLessThan(-8);
    expect(north.yaw).toBe(-Math.PI / 2);
  });

  it('places an authored exit against the adjacent wall with its face toward the corridor', () => {
    const north = chroniclesExitGateTransform(
      CHRONICLES_MAP,
      { position: { x: 3, y: 1 } },
    );
    expect(north.side).toBe('north');
    expect(north.position.x).toBeCloseTo(0);
    expect(north.position.z).toBeLessThan(-9);
    expect(north.yaw).toBe(0);

    const east = chroniclesExitGateTransform(
      [
        '##.##',
        '#..##',
        '#...#',
        '#####',
      ],
      { position: { x: 2, y: 1 } },
      { x: 2, y: 1.5 },
    );
    expect(east.side).toBe('east');
    expect(east.yaw).toBeCloseTo(-Math.PI / 2);
  });

  it('rejects unknown wall sides instead of silently placing a floating torch', () => {
    expect(() => chroniclesTorchTransform(1, 1, 'ceiling')).toThrow(/torch wall side/);
  });

  it('resolves clickable authored content ids through nested meshes', () => {
    const root = { userData: { chroniclesContentId: 'gallery-lever' }, parent: null };
    const pivot = { userData: {}, parent: root };
    const knob = { userData: {}, parent: pivot };

    expect(chroniclesContentIdFromObject(knob)).toBe('gallery-lever');
    expect(chroniclesContentIdFromObject({ userData: {}, parent: null })).toBeNull();
  });

  it('faces a blocking fantasy enemy toward the party instead of presenting its side profile', () => {
    expect(chroniclesEnemyFacingYaw({ x: 3, y: 5 }, { x: 2, y: 5 })).toBeCloseTo(-Math.PI / 2);
    expect(chroniclesEnemyFacingYaw({ x: 3, y: 3 }, { x: 3, y: 5 })).toBeCloseTo(0);
    expect(chroniclesEnemyFacingYaw({ x: 3, y: 3 }, { x: 3, y: 1 })).toBeCloseTo(Math.PI);
  });
});
