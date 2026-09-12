import { describe, expect, it } from 'vitest';
import {
  HOME_CASTLE_SECONDARY_PROP_ANCHORS,
  createHomeCastleSecondaryDestinationProps,
} from './HomeCastle3DSecondaryProps.js';

describe('HomeCastle3DSecondaryProps', () => {
  it('anchors History on the left furniture and Combat in the central arch', () => {
    expect(HOME_CASTLE_SECONDARY_PROP_ANCHORS.history.x).toBeLessThan(-1.05);
    expect(HOME_CASTLE_SECONDARY_PROP_ANCHORS.history.y).toBeLessThan(0);
    expect(HOME_CASTLE_SECONDARY_PROP_ANCHORS.history.z).toBeGreaterThan(0.25);

    expect(HOME_CASTLE_SECONDARY_PROP_ANCHORS.combat.x).toBeGreaterThan(0.2);
    expect(HOME_CASTLE_SECONDARY_PROP_ANCHORS.combat.x).toBeLessThan(0.5);
    expect(HOME_CASTLE_SECONDARY_PROP_ANCHORS.combat.y).toBeGreaterThan(0);
    expect(HOME_CASTLE_SECONDARY_PROP_ANCHORS.combat.z).toBeGreaterThan(0.24);
  });

  it('builds physical History and Combat props with persistent destination identity', () => {
    const props = createHomeCastleSecondaryDestinationProps();
    expect(props.group.name).toBe('home-castle-secondary-destination-props');
    expect(props.history.name).toBe('home-castle-prop-history');
    expect(props.history.userData.destination).toBe('history');
    expect(props.combat.name).toBe('home-castle-prop-combat');
    expect(props.combat.userData.destination).toBe('combat');
    expect(props.history.children.length).toBeGreaterThanOrEqual(5);
    expect(props.combat.children.length).toBeGreaterThanOrEqual(4);
    expect(props.history.children.some((child) => child.name === 'home-castle-history-seal')).toBe(true);
    expect(props.combat.children.some((child) => child.name === 'home-castle-combat-shield')).toBe(true);
    expect(props.history.userData.baseScale).toBeGreaterThan(0.65);
    expect(props.combat.userData.baseScale).toBeGreaterThan(0.65);
    props.dispose();
  });
});
