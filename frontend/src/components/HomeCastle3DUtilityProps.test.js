import { describe, expect, it } from 'vitest';
import {
  HOME_CASTLE_UTILITY_PROP_ANCHORS,
  createHomeCastleUtilityDestinationProps,
} from './HomeCastle3DUtilityProps.js';

describe('HomeCastle3DUtilityProps', () => {
  it('anchors Pawn Slug by the right railing and Mazmorras in the lower-right approach', () => {
    expect(HOME_CASTLE_UTILITY_PROP_ANCHORS.pawnslug.x).toBeGreaterThan(0.65);
    expect(HOME_CASTLE_UTILITY_PROP_ANCHORS.pawnslug.y).toBeLessThan(-0.2);
    expect(HOME_CASTLE_UTILITY_PROP_ANCHORS.dungeon.x).toBeGreaterThan(0.45);
    expect(HOME_CASTLE_UTILITY_PROP_ANCHORS.dungeon.y).toBeLessThan(-0.4);
  });

  it('builds physical, focusable destination props instead of extra HUD', () => {
    const props = createHomeCastleUtilityDestinationProps();

    expect(props.group.name).toBe('home-castle-utility-destination-props');
    expect(props.pawnslug.name).toBe('home-castle-prop-pawnslug');
    expect(props.pawnslug.userData.destination).toBe('pawnslug');
    expect(props.dungeon.name).toBe('home-castle-prop-dungeon');
    expect(props.dungeon.userData.destination).toBe('dungeon');
    expect(props.pawnslug.userData.baseScale).toBeGreaterThan(0.6);
    expect(props.pawnslug.userData.baseScale).toBeLessThan(0.8);
    expect(props.dungeon.userData.baseScale).toBeGreaterThan(0.6);
    expect(props.dungeon.userData.baseScale).toBeLessThan(0.8);

    expect(props.pawnslug.getObjectByName('home-castle-pawnslug-crate')).toBeTruthy();
    expect(props.pawnslug.getObjectByName('home-castle-pawnslug-shell-1')).toBeTruthy();
    expect(props.dungeon.getObjectByName('home-castle-dungeon-lantern')).toBeTruthy();
    expect(props.dungeon.getObjectByName('home-castle-dungeon-key')).toBeTruthy();

    props.dispose();
  });
});
