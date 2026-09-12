import { describe, expect, it } from 'vitest';
import {
  HOME_CASTLE_CHANDELIER_LIGHT_ANCHORS,
  HOME_CASTLE_DESTINATION_PROP_ANCHORS,
  HOME_CASTLE_DUST_MOTE_COUNT,
  HOME_CASTLE_FIREPLACE_LIGHT_ANCHOR,
  HOME_CASTLE_TORCH_ANCHORS,
  createHomeCastleDestinationProps,
  createHomeCastleTorchProps,
  homeCastleDestinationPropScale,
} from './HomeCastle3DProps.js';

describe('HomeCastle3DProps', () => {
  it('keeps the canonical torches mirrored around the hall center', () => {
    expect(HOME_CASTLE_TORCH_ANCHORS).toHaveLength(2);
    const [left, right] = HOME_CASTLE_TORCH_ANCHORS;
    expect(left.x).toBe(-right.x);
    expect(left.y).toBe(right.y);
    expect(left.z).toBe(right.z);
  });

  it('keeps both torch anchors on the inner wall sconces, away from menu copy', () => {
    for (const anchor of HOME_CASTLE_TORCH_ANCHORS) {
      expect(Math.abs(anchor.x)).toBeGreaterThan(0.65);
      expect(Math.abs(anchor.x)).toBeLessThan(0.8);
      expect(anchor.y).toBeGreaterThan(0.18);
      expect(anchor.y).toBeLessThan(0.3);
      expect(anchor.z).toBeGreaterThan(0);
      expect(anchor.z).toBeLessThan(0.3);
    }
  });

  it('keeps chandelier light anchors mirrored high above the room destinations', () => {
    expect(HOME_CASTLE_CHANDELIER_LIGHT_ANCHORS).toHaveLength(2);
    const [left, right] = HOME_CASTLE_CHANDELIER_LIGHT_ANCHORS;
    expect(left.x).toBe(-right.x);
    expect(left.y).toBe(right.y);
    expect(left.z).toBe(right.z);
    expect(left.y).toBeGreaterThan(0.65);
    expect(left.z).toBeGreaterThan(0.9);
  });

  it('anchors the fireplace light in the right foreground, below the destinations', () => {
    expect(HOME_CASTLE_FIREPLACE_LIGHT_ANCHOR.x).toBeGreaterThan(1);
    expect(HOME_CASTLE_FIREPLACE_LIGHT_ANCHOR.y).toBeLessThan(-0.4);
    expect(HOME_CASTLE_FIREPLACE_LIGHT_ANCHOR.z).toBeGreaterThan(0.7);
    expect(HOME_CASTLE_FIREPLACE_LIGHT_ANCHOR.z).toBeLessThan(1);
  });

  it('places tournament and training props in the left furniture and library zones', () => {
    const tournament = HOME_CASTLE_DESTINATION_PROP_ANCHORS.tournament;
    const train = HOME_CASTLE_DESTINATION_PROP_ANCHORS.train;
    expect(tournament.x).toBeLessThan(-0.8);
    expect(tournament.x).toBeGreaterThan(-1.1);
    expect(Math.abs(tournament.y)).toBeLessThan(0.12);
    expect(tournament.z).toBeGreaterThan(0.25);
    expect(train.x).toBeLessThan(-0.2);
    expect(train.x).toBeGreaterThan(-0.5);
    expect(Math.abs(train.y)).toBeLessThan(0.12);
    expect(train.z).toBeGreaterThan(0.25);
  });

  it('places the play rook on the visible center board and daily brazier on the right altar', () => {
    expect(Math.abs(HOME_CASTLE_DESTINATION_PROP_ANCHORS.play.x)).toBeLessThan(0.1);
    expect(HOME_CASTLE_DESTINATION_PROP_ANCHORS.play.y).toBeGreaterThan(-0.3);
    expect(HOME_CASTLE_DESTINATION_PROP_ANCHORS.play.y).toBeLessThan(-0.15);
    expect(HOME_CASTLE_DESTINATION_PROP_ANCHORS.play.z).toBeGreaterThan(0.25);

    expect(HOME_CASTLE_DESTINATION_PROP_ANCHORS.daily.x).toBeGreaterThan(0.75);
    expect(Math.abs(HOME_CASTLE_DESTINATION_PROP_ANCHORS.daily.y)).toBeLessThan(0.12);
    expect(HOME_CASTLE_DESTINATION_PROP_ANCHORS.daily.z).toBeGreaterThan(0.25);
  });

  it('scales destination props by real viewport aspect and visible stage width', () => {
    expect(homeCastleDestinationPropScale(1.6)).toBe(1);
    expect(homeCastleDestinationPropScale(16 / 9)).toBe(1);
    expect(homeCastleDestinationPropScale(16 / 9, 0.42)).toBeCloseTo(0.42, 4);
    const phoneScale = homeCastleDestinationPropScale(390 / 844, 1);
    expect(phoneScale).toBeGreaterThan(0.28);
    expect(phoneScale).toBeLessThan(0.30);
    expect(homeCastleDestinationPropScale(980 / 1740, 1)).toBeCloseTo(0.352, 3);
    expect(homeCastleDestinationPropScale(16 / 9, 0.1)).toBe(0.28);
  });

  it('builds real 3D destination props instead of HUD-only markers', () => {
    const props = createHomeCastleDestinationProps();
    expect(props.group.name).toBe('home-castle-destination-props');
    expect(props.tournament.name).toBe('home-castle-prop-tournament');
    expect(props.tournament.userData.destination).toBe('tournament');
    expect(props.train.name).toBe('home-castle-prop-train');
    expect(props.train.userData.destination).toBe('train');
    expect(props.play.name).toBe('home-castle-prop-play');
    expect(props.play.userData.destination).toBe('play');
    expect(props.daily.name).toBe('home-castle-prop-daily');
    expect(props.daily.userData.destination).toBe('daily');
    expect(props.tournament.userData.baseScale).toBeGreaterThan(0.65);
    expect(props.tournament.userData.baseScale).toBeLessThan(0.85);
    expect(props.train.userData.baseScale).toBeGreaterThan(0.65);
    expect(props.train.userData.baseScale).toBeLessThan(0.85);
    expect(props.play.userData.baseScale).toBeGreaterThan(0.75);
    expect(props.play.userData.baseScale).toBeLessThan(0.9);
    expect(props.daily.userData.baseScale).toBeLessThan(0.9);
    expect(props.tournament.children.length).toBeGreaterThan(5);
    expect(props.train.children.some((child) => child.name === 'home-castle-training-book')).toBe(true);
    expect(props.play.children.length).toBeGreaterThan(5);
    expect(props.daily.children.length).toBeGreaterThan(4);
    expect(props.daily.children.some((child) => child.name === 'home-castle-daily-flame')).toBe(true);
    props.dispose();
  });

  it('adds only a restrained flame overlay above each painted sconce', () => {
    const props = createHomeCastleTorchProps();
    expect(props.flames).toHaveLength(HOME_CASTLE_TORCH_ANCHORS.length);
    for (const flame of props.flames) {
      expect(flame?.name).toBe('home-castle-flame');
      expect(flame?.material?.transparent).toBe(true);
      expect(flame?.material?.depthWrite).toBe(false);
    }
    expect(props.destinationProps.tournament.userData.destination).toBe('tournament');
    expect(props.destinationProps.train.userData.destination).toBe('train');
    expect(props.destinationProps.play.userData.destination).toBe('play');
    expect(props.destinationProps.daily.userData.destination).toBe('daily');
    props.dispose();
  });

  it('adds a tiny deterministic dust cloud with real depth but no animation contract', () => {
    const props = createHomeCastleTorchProps();
    const position = props.dust.geometry.getAttribute('position');
    expect(props.dust.name).toBe('home-castle-dust');
    expect(position.count).toBe(HOME_CASTLE_DUST_MOTE_COUNT);
    expect(props.dust.material.opacity).toBeLessThanOrEqual(0.12);
    expect(props.dust.material.depthWrite).toBe(false);

    for (let index = 0; index < position.count; index += 1) {
      expect(Math.abs(position.getX(index))).toBeLessThanOrEqual(1.15);
      expect(position.getY(index)).toBeGreaterThanOrEqual(0.3);
      expect(position.getY(index)).toBeLessThanOrEqual(0.82);
      expect(position.getZ(index)).toBeGreaterThanOrEqual(0.24);
      expect(position.getZ(index)).toBeLessThanOrEqual(0.74);
    }
    props.dispose();
  });
});
