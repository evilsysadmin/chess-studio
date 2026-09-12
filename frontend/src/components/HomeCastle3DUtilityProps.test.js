import { describe, expect, it } from 'vitest';
import { homeCastleKnownRoom, homeCastleRoomFocus } from './HomeCastle3DRoomFocus.js';
import {
  HOME_CASTLE_UTILITY_PROP_ANCHORS,
  createHomeCastleUtilityDestinationProps,
  homeCastleUtilityPropPositionScale,
} from './HomeCastle3DUtilityProps.js';

describe('HomeCastle3DUtilityProps', () => {
  it('anchors Pawn Slug by the right railing and Mazmorras in the lower-right approach', () => {
    expect(HOME_CASTLE_UTILITY_PROP_ANCHORS.pawnslug.x).toBeGreaterThan(0.65);
    expect(HOME_CASTLE_UTILITY_PROP_ANCHORS.pawnslug.y).toBeLessThan(-0.2);
    expect(HOME_CASTLE_UTILITY_PROP_ANCHORS.dungeon.x).toBeGreaterThan(0.8);
    expect(HOME_CASTLE_UTILITY_PROP_ANCHORS.dungeon.y).toBeLessThan(-0.4);
  });

  it('keeps utility props inside narrow and cropped castle views without moving desktop staging', () => {
    expect(homeCastleUtilityPropPositionScale(1.6, 1)).toBe(1);
    expect(homeCastleUtilityPropPositionScale(16 / 9, 0.42)).toBeCloseTo(0.42, 4);
    expect(homeCastleUtilityPropPositionScale(390 / 844, 1)).toBe(0.34);
    expect(homeCastleUtilityPropPositionScale(0, 0)).toBe(1);
  });

  it('registers both utility destinations with restrained room-light focus', () => {
    for (const room of ['pawnslug', 'dungeon']) {
      expect(homeCastleKnownRoom(room)).toBe(true);
      const focus = homeCastleRoomFocus(room);
      expect(focus.light).toBeGreaterThan(0);
      expect(focus.light).toBeLessThanOrEqual(0.22);
      expect(focus.reach).toBeLessThan(1.35);
    }
  });

  it('builds physical, focusable destination props instead of extra HUD', () => {
    const props = createHomeCastleUtilityDestinationProps();

    expect(props.group.name).toBe('home-castle-utility-destination-props');
    expect(props.pawnslug.name).toBe('home-castle-prop-pawnslug');
    expect(props.pawnslug.userData.destination).toBe('pawnslug');
    expect(props.dungeon.name).toBe('home-castle-prop-dungeon');
    expect(props.dungeon.userData.destination).toBe('dungeon');
    expect(props.pawnslug.userData.baseScale).toBeGreaterThan(0.8);
    expect(props.pawnslug.userData.baseScale).toBeLessThan(0.9);
    expect(props.dungeon.userData.baseScale).toBeGreaterThan(0.85);
    expect(props.dungeon.userData.baseScale).toBeLessThan(0.95);

    expect(props.pawnslug.getObjectByName('home-castle-pawnslug-crate')).toBeTruthy();
    expect(props.pawnslug.getObjectByName('home-castle-pawnslug-shell-1')).toBeTruthy();
    expect(props.dungeon.getObjectByName('home-castle-dungeon-lantern')).toBeTruthy();
    expect(props.dungeon.getObjectByName('home-castle-dungeon-key')).toBeTruthy();

    props.dispose();
  });
});
