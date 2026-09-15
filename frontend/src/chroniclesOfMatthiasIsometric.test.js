import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_ISO_PARTY_FACING,
  CHRONICLES_ISO_PARTY_LAYOUT,
  chroniclesIsoInteractionForHit,
  chroniclesIsoWorldForCell,
  chroniclesIsoWorldObjectState,
  chroniclesIsometricCameraPose,
} from './chroniclesOfMatthiasIsometric.js';

describe('Chronicles canonical isometric viewport', () => {
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

  it('keeps the camera low and close enough for behind-party action framing', () => {
    const focus = { x: 2, z: -3 };
    const pose = chroniclesIsometricCameraPose(focus);
    const horizontalDistance = Math.hypot(pose.position.x - focus.x, pose.position.z - focus.z);

    expect(pose.position.y).toBeGreaterThan(2.75);
    expect(pose.position.y).toBeLessThan(3.75);
    expect(horizontalDistance).toBeGreaterThan(5.5);
    expect(horizontalDistance).toBeLessThan(7);
    expect(pose.position.x).toBeGreaterThan(focus.x);
    expect(pose.position.z).toBeGreaterThan(focus.z);
    expect(pose.target.x).toBeLessThan(focus.x);
    expect(pose.target.z).toBeLessThan(focus.z - 2);
    expect(pose.target.y).toBeGreaterThan(0.8);
    expect(pose.fov).toBeGreaterThanOrEqual(41);
    expect(pose.fov).toBeLessThanOrEqual(44);
  });

  it('gives the party foreground scale, lateral spread and one forward-facing direction', () => {
    const members = Object.values(CHRONICLES_ISO_PARTY_LAYOUT);
    const xs = members.map((member) => member.x);
    const zs = members.map((member) => member.z);

    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1.6);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.8);
    members.forEach((member) => expect(member.scale).toBeGreaterThanOrEqual(1));
    expect(CHRONICLES_ISO_PARTY_FACING).toBeCloseTo(-Math.PI * 0.75, 6);
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

  it('keeps the lever down after use and shows the rune core only until collection', () => {
    expect(chroniclesIsoWorldObjectState({})).toEqual({
      leverPulled: false,
      runeCoreVisible: false,
    });
    expect(chroniclesIsoWorldObjectState({ runeCacheOpened: true })).toEqual({
      leverPulled: true,
      runeCoreVisible: true,
    });
    expect(chroniclesIsoWorldObjectState({ runeCacheOpened: true, runeCoreCollected: true })).toEqual({
      leverPulled: true,
      runeCoreVisible: false,
    });
  });
});
