import { describe, expect, it } from 'vitest';
import {
  chroniclesIsoInteractionForHit,
  chroniclesIsoWorldForCell,
  chroniclesThirdPersonCameraPose,
} from './chroniclesOfMatthiasIsometric.js';

describe('Chronicles canonical third-person tactical viewport', () => {
  it('maps dungeon cells to a stable square world grid', () => {
    const centre = chroniclesIsoWorldForCell(3, 3);
    const east = chroniclesIsoWorldForCell(4, 3);
    const south = chroniclesIsoWorldForCell(3, 4);

    expect([centre.x, centre.y, centre.z]).toEqual([0, 0, 0]);
    expect(east.x).toBeGreaterThan(centre.x);
    expect(east.z).toBe(centre.z);
    expect(south.z).toBeGreaterThan(centre.z);
    expect(south.x).toBe(centre.x);
    expect(east.x - centre.x).toBeCloseTo(south.z - centre.z, 6);
  });

  it('keeps the camera behind the party while looking into the encounter', () => {
    const party = { x: 2, z: 4 };
    const enemy = { x: 2, z: -3 };
    const pose = chroniclesThirdPersonCameraPose(party, enemy);

    expect(pose.position.y).toBeGreaterThan(2.5);
    expect(pose.position.y).toBeLessThan(4.5);
    expect(pose.position.z).toBeGreaterThan(party.z);
    expect(pose.target.z).toBeLessThan(party.z);
    expect(pose.target.y).toBeGreaterThan(0);
    expect(pose.fov).toBeGreaterThanOrEqual(44);
    expect(pose.fov).toBeLessThanOrEqual(50);
  });

  it('orients the camera behind the party for lateral encounters too', () => {
    const pose = chroniclesThirdPersonCameraPose({ x: 0, z: 0 }, { x: 6, z: 0 });

    expect(pose.position.x).toBeLessThan(0);
    expect(pose.target.x).toBeGreaterThan(0);
  });

  it('accepts only highlighted cells while move mode is active', () => {
    const interaction = {
      mode: 'move',
      legalMoves: [{ x: 2, y: 5 }, { x: 1, y: 4 }],
      legalTargets: [],
    };

    expect(chroniclesIsoInteractionForHit(interaction, { kind: 'cell', x: 2, y: 5 })).toEqual({ kind: 'cell', x: 2, y: 5 });
    expect(chroniclesIsoInteractionForHit(interaction, { kind: 'cell', x: 3, y: 5 })).toBeNull();
    expect(chroniclesIsoInteractionForHit(interaction, { kind: 'enemy', enemyId: 'corrupted-pawn' })).toBeNull();
  });

  it('accepts only legal enemies while attack mode is active', () => {
    const interaction = {
      mode: 'attack',
      legalMoves: [],
      legalTargets: [{ enemyId: 'corrupted-pawn', x: 3, y: 5 }],
    };

    expect(chroniclesIsoInteractionForHit(interaction, { kind: 'enemy', enemyId: 'corrupted-pawn' })).toEqual({
      kind: 'enemy', enemyId: 'corrupted-pawn',
    });
    expect(chroniclesIsoInteractionForHit(interaction, { kind: 'enemy', enemyId: 'gate-jailer' })).toBeNull();
    expect(chroniclesIsoInteractionForHit(null, { kind: 'enemy', enemyId: 'corrupted-pawn' })).toBeNull();
  });
});
