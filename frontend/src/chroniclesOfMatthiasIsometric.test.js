import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_ISO_MARKER_STYLE,
  CHRONICLES_ISO_PARTY_FACING,
  CHRONICLES_ISO_PARTY_LAYOUT,
  chroniclesIsoInteractionForHit,
  chroniclesIsoPointerAction,
  chroniclesIsoUsesLegacyDressing,
  chroniclesIsoWorldForCell,
  chroniclesIsoWorldForContentKind,
  chroniclesIsoWorldObjectState,
  chroniclesIsometricCameraPose,
  chroniclesIsometricFovForAspect,
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

  it('centers renderer coordinates on the supplied scene plan instead of a fixed 7x7 origin', () => {
    const plan = { center: { x: 2, y: 1 } };
    const centre = chroniclesIsoWorldForCell(2, 1, plan);
    const corner = chroniclesIsoWorldForCell(4, 2, plan);

    expect([centre.x, centre.y, centre.z]).toEqual([0, 0, 0]);
    expect([corner.x, corner.y, corner.z]).toEqual([4.9, 0, 2.45]);
  });

  it('resolves functional prop positions by authored kind instead of room-specific ids', () => {
    const plan = {
      content: [
        { id: 'gallery-lever', kind: 'lever', world: { x: 4.9, y: 0, z: 4.9 } },
        { id: 'gallery-relic', kind: 'pickup', world: { x: 4.9, y: 0, z: 2.45 } },
      ],
    };

    const lever = chroniclesIsoWorldForContentKind(plan, 'lever');
    const pickup = chroniclesIsoWorldForContentKind(plan, 'pickup');

    expect([lever.x, lever.y, lever.z]).toEqual([4.9, 0, 4.9]);
    expect([pickup.x, pickup.y, pickup.z]).toEqual([4.9, 0, 2.45]);
    expect(chroniclesIsoWorldForContentKind(plan, 'trigger')).toBeNull();
  });

  it('keeps legacy crypt dressing opt-in through the scene style contract', () => {
    expect(chroniclesIsoUsesLegacyDressing({
      sceneStyle: { dressing: 'crypt-legacy' },
    })).toBe(true);
    expect(chroniclesIsoUsesLegacyDressing({
      sceneStyle: { dressing: 'none' },
    })).toBe(false);
    expect(chroniclesIsoUsesLegacyDressing(null)).toBe(false);
  });

  it('keeps the camera straight behind the party with an elevated tactical read', () => {
    const focus = { x: 2, z: -3 };
    const pose = chroniclesIsometricCameraPose(focus);
    const horizontalDistance = Math.hypot(pose.position.x - focus.x, pose.position.z - focus.z);

    expect(pose.position.y).toBeGreaterThan(7.8);
    expect(pose.position.y).toBeLessThan(8.5);
    expect(horizontalDistance).toBeGreaterThan(8.3);
    expect(horizontalDistance).toBeLessThan(8.8);
    expect(pose.position.x).toBeCloseTo(focus.x, 6);
    expect(pose.position.z).toBeGreaterThan(focus.z + 8.3);
    expect(pose.target.x).toBeCloseTo(focus.x, 6);
    expect(pose.target.z).toBeLessThan(focus.z - 2.5);
    expect(pose.target.y).toBeGreaterThan(0.6);
    expect(pose.target.y).toBeLessThan(0.9);
    expect(pose.fov).toBeGreaterThanOrEqual(37);
    expect(pose.fov).toBeLessThanOrEqual(39);
  });

  it('spreads the four backs across a shallow foreground formation', () => {
    const members = Object.values(CHRONICLES_ISO_PARTY_LAYOUT);
    const xs = members.map((member) => member.x);
    const zs = members.map((member) => member.z);

    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(3.1);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(0.35);
    members.forEach((member) => expect(member.scale).toBeGreaterThanOrEqual(1));
    expect(CHRONICLES_ISO_PARTY_FACING).toBeCloseTo(Math.PI, 6);
  });

  it('keeps the canonical tactical markers square and semantically colored', () => {
    expect(CHRONICLES_ISO_MARKER_STYLE.shape).toBe('square');
    expect(CHRONICLES_ISO_MARKER_STYLE.moveColor).toBe(0x65bfe3);
    expect(CHRONICLES_ISO_MARKER_STYLE.attackColor).toBe(0xc45143);
    expect(CHRONICLES_ISO_MARKER_STYLE.selectionColor).toBe(0xd8b56a);
  });

  it('adds restrained FOV only when the canvas becomes narrow', () => {
    expect(chroniclesIsometricFovForAspect(1.6, 38)).toBe(38);
    expect(chroniclesIsometricFovForAspect(1.21, 38)).toBe(40.5);
    expect(chroniclesIsometricFovForAspect(0.85, 38)).toBe(42.5);
    expect(chroniclesIsometricFovForAspect(0.65, 38)).toBe(45);
    expect(chroniclesIsometricFovForAspect(0, 38)).toBe(38);
    expect(chroniclesIsometricFovForAspect(Number.NaN, 38)).toBe(38);
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

  it('turns a party-model hit into a member action without requiring a combat interaction mode', () => {
    expect(chroniclesIsoPointerAction(null, { kind: 'member', memberId: 'bishop' })).toEqual({
      kind: 'member', memberId: 'bishop',
    });
    expect(chroniclesIsoPointerAction({ mode: 'attack', legalTargets: [] }, {
      kind: 'member', memberId: 'knight',
    })).toEqual({ kind: 'member', memberId: 'knight' });
    expect(chroniclesIsoPointerAction(null, { kind: 'cell', x: 2, y: 5 })).toBeNull();
  });

  it('drives trigger, lever and pickup visuals from authored state rather than Crypt aliases', () => {
    expect(chroniclesIsoWorldObjectState({
      mapId: 'gallery-of-forks',
      galleryLeverPulled: false,
      galleryRelicCollected: false,
      runeCacheOpened: true,
      runeCoreCollected: true,
    })).toEqual({
      triggerActivated: false,
      leverActivated: false,
      pickupVisible: false,
    });

    expect(chroniclesIsoWorldObjectState({
      mapId: 'gallery-of-forks',
      galleryLeverPulled: true,
      galleryRelicCollected: false,
      runeCacheOpened: false,
      runeCoreCollected: true,
    })).toEqual({
      triggerActivated: false,
      leverActivated: true,
      pickupVisible: true,
    });

    expect(chroniclesIsoWorldObjectState({
      mapId: 'gallery-of-forks',
      galleryLeverPulled: true,
      galleryRelicCollected: true,
      runeCacheOpened: false,
      runeCoreCollected: false,
    })).toEqual({
      triggerActivated: false,
      leverActivated: true,
      pickupVisible: false,
    });
  });
});