import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HOME_MATTHIAS_ACTOR_SCALE,
  HOME_MATTHIAS_ACTOR_STATIONS,
  HOME_MATTHIAS_ARM_POSES,
  HOME_MATTHIAS_POSTURES,
  HOME_MATTHIAS_PROP_ANCHORS,
  homeMatthiasActorRoutine,
  homeMatthiasActorStationForProfile,
  homeMatthiasBlanketProfile,
  homeMatthiasBlenderToThree,
  homeMatthiasProjectBounds,
  homeMatthiasSipWeight,
  homeMatthiasSpineDrop,
} from './HomeBlenderMatthiasActor.js';

// Furniture from scripts/blender/build_home_v2_blockout.py (Blender frame).
const CHAIR_SEAT_TOP = 0.855;
const RIGHT_CHAIR = [4.14, 1.05];
const LEFT_CHAIR = [-4.14, 1.05];
const KLAUS_CUSHION = { x: 4.32, y: -1.5, radius: 0.43 };
// The stairs/Mazmorras hotspot owns the right side of the hall on screen.
const MAZMORRAS_MIN_STAGE_X = 0.68;
const TABLE = { minX: -3.72, maxX: 3.72, minY: -0.67, maxY: 2.77 };
const DAYBED_SEAT = { minX: -7.25, maxX: -5.68, minY: -0.97, maxY: 0.97, top: 0.965 };
// Rest-pose plinth radius of the canonical rig.
const PLINTH_RADIUS = 0.62;

describe('Home Matthias in-scene actor', () => {
  it('maps every routine to a station whose posture makes sense for it', () => {
    expect(homeMatthiasActorStationForProfile('sip')).toBe('table-coffee');
    expect(homeMatthiasActorStationForProfile('dossier')).toBe('hearth-files');
    expect(homeMatthiasActorStationForProfile('think')).toBe('chess-chair');
    expect(homeMatthiasActorStationForProfile('read')).toBe('reading-chair');
    expect(homeMatthiasActorStationForProfile('sleep')).toBe('sofa-nap');
    expect(homeMatthiasActorStationForProfile('unknown')).toBe('table-coffee');

    expect(HOME_MATTHIAS_ACTOR_STATIONS['table-coffee'].posture).toBe('stand');
    expect(HOME_MATTHIAS_ACTOR_STATIONS['hearth-files'].posture).toBe('stand');
    expect(HOME_MATTHIAS_ACTOR_STATIONS['chess-chair'].posture).toBe('seat');
    expect(HOME_MATTHIAS_ACTOR_STATIONS['reading-chair'].posture).toBe('seat');
    expect(HOME_MATTHIAS_ACTOR_STATIONS['sofa-nap'].posture).toBe('lie');
  });

  it('derives the routine from the same scene/activity cues as the portrait', () => {
    expect(homeMatthiasActorRoutine({ scene: 'time-morning-coffee' })).toMatchObject({
      profile: 'sip', clip: 'Sip', stationId: 'table-coffee', posture: 'stand',
    });
    expect(homeMatthiasActorRoutine({ scene: 'time-chess-inception' })).toMatchObject({
      profile: 'think', clip: 'Think', stationId: 'chess-chair', posture: 'seat',
    });
    expect(homeMatthiasActorRoutine({ scene: 'time-late-sleep' })).toMatchObject({
      profile: 'sleep', clip: 'Sleep', stationId: 'sofa-nap', posture: 'lie',
    });
    expect(homeMatthiasActorRoutine({ scene: 'moment-book-doze-sleep' })).toMatchObject({
      profile: 'sleep', clip: 'Sleep', stationId: 'reading-chair', posture: 'seat', propProfile: 'read',
    });
    expect(homeMatthiasActorRoutine({ scene: 'time-late-sleep' }).propProfile).toBe('sleep');
    expect(homeMatthiasActorRoutine({ scene: 'time-late-sleep', speaking: true })).toMatchObject({
      profile: 'speak', posture: 'stand',
    });
  });

  it('stands on the floor, clear of the table, the chairs and Klaus', () => {
    for (const id of ['table-coffee', 'hearth-files', 'sofa-nap']) {
      // Standing and lying stations stay off the Mazmorras hotspot; only the
      // seated chair overlaps it, and the CSS stacks him above it there.
      const camera = new THREE.PerspectiveCamera(22.9, 16 / 9, 0.1, 80);
      camera.position.set(0, 4.85, 16);
      camera.lookAt(0, 1.55, -2.3);
      camera.updateMatrixWorld(true);
      const world = homeMatthiasBlenderToThree(HOME_MATTHIAS_ACTOR_STATIONS[id].at);
      const point = new THREE.Vector3(world.x, world.y + 0.8, world.z).project(camera);
      expect((point.x * 0.5) + 0.5).toBeLessThan(MAZMORRAS_MIN_STAGE_X);
    }
    for (const id of ['table-coffee', 'hearth-files']) {
      const [x, y, z] = HOME_MATTHIAS_ACTOR_STATIONS[id].at;
      const radius = PLINTH_RADIUS * HOME_MATTHIAS_ACTOR_SCALE;
      expect(z).toBe(0);
      const outsideTable = x - radius > TABLE.maxX || x + radius < TABLE.minX || y + radius < TABLE.minY;
      expect(outsideTable).toBe(true);
      for (const [cx, cy] of [RIGHT_CHAIR, LEFT_CHAIR]) {
        expect(Math.hypot(x - cx, y - cy)).toBeGreaterThan(radius + 0.35);
      }
      expect(Math.hypot(x - KLAUS_CUSHION.x, y - KLAUS_CUSHION.y))
        .toBeGreaterThan(radius + KLAUS_CUSHION.radius);
    }
  });

  it('sits on the real chair seats and faces the board', () => {
    for (const id of ['chess-chair', 'reading-chair']) {
      const seat = HOME_MATTHIAS_ACTOR_STATIONS[id];
      // Right chair: the end with his board, books and mug. Slightly forward
      // of the cushion centre, never off the 0.62-deep seat.
      expect(Math.hypot(seat.at[0] - RIGHT_CHAIR[0], seat.at[1] - RIGHT_CHAIR[1])).toBeLessThan(0.12);
      expect(seat.at[2]).toBeCloseTo(CHAIR_SEAT_TOP, 3);
      // The right chair faces the table towards -x.
      expect(Math.sin(THREE.MathUtils.degToRad(seat.yawDeg))).toBeLessThan(-0.5);
    }
  });

  it('lies on the daybed seat, not on the floor or in the air', () => {
    const nap = HOME_MATTHIAS_ACTOR_STATIONS['sofa-nap'];
    const [x, y, z] = nap.at;
    expect(x).toBeGreaterThan(DAYBED_SEAT.minX);
    expect(x).toBeLessThan(DAYBED_SEAT.maxX);
    expect(y).toBeGreaterThan(DAYBED_SEAT.minY);
    expect(y).toBeLessThan(DAYBED_SEAT.maxY);
    // Body axis rests at about one slim-skirt radius above the cushion.
    const lie = HOME_MATTHIAS_POSTURES.lie;
    const slimRadius = PLINTH_RADIUS * lie.skirtXZ * HOME_MATTHIAS_ACTOR_SCALE;
    expect(z - DAYBED_SEAT.top).toBeGreaterThan(slimRadius * 0.8);
    expect(z - DAYBED_SEAT.top).toBeLessThan(slimRadius * 1.25);
  });

  it('adapts the pawn body per posture instead of keeping a rigid plinth', () => {
    expect(homeMatthiasSpineDrop('stand')).toBe(0);
    expect(homeMatthiasSpineDrop('seat')).toBeGreaterThan(0.2);
    // Seated: a shorter bell with its own shape, not a squashed blob.
    const seat = HOME_MATTHIAS_POSTURES.seat;
    expect(seat.skirtXZ).toBeLessThan(0.8);
    expect(Math.abs(seat.skirtY - seat.skirtXZ)).toBeLessThan(0.15);
    expect(HOME_MATTHIAS_POSTURES.lie.skirtXZ).toBeLessThan(0.7);
    // Standing keeps the bell just off the floor: no tall gap under the skirt.
    expect(HOME_MATTHIAS_POSTURES.stand.lift).toBeLessThan(0.1);
  });

  it('gives props real hands instead of floating beside dangling arms', () => {
    expect(HOME_MATTHIAS_ARM_POSES.sip.R).toBeTruthy();
    expect(HOME_MATTHIAS_ARM_POSES.dossier.L).toBeTruthy();
    expect(HOME_MATTHIAS_ARM_POSES.dossier.R).toBeTruthy();
    expect(HOME_MATTHIAS_PROP_ANCHORS.sip).toMatchObject({ bone: 'prop_cup', hand: 'Hand.R' });
    // The bocadillo goes in the same hand whose arm is posed for it.
    expect(HOME_MATTHIAS_PROP_ANCHORS.bite.hand).toBe('Hand.R');
    expect(HOME_MATTHIAS_ARM_POSES.bite.R).toBeTruthy();
    expect(HOME_MATTHIAS_ARM_POSES.think.L).toBeTruthy();
    expect(HOME_MATTHIAS_PROP_ANCHORS.sip.hide).toContain('RoutineCupHand');
    expect(HOME_MATTHIAS_PROP_ANCHORS.dossier.hide).toEqual(['RoutineBookHand.L', 'RoutineBookHand.R']);
  });

  it('sips on a slow cycle and holds the cup at the chest otherwise', () => {
    expect(homeMatthiasSipWeight(0)).toBe(0);
    expect(homeMatthiasSipWeight(7)).toBe(1);
    expect(homeMatthiasSipWeight(7 + 9.6)).toBe(1);
    expect(homeMatthiasSipWeight(6.2)).toBeGreaterThan(0);
    expect(homeMatthiasSipWeight(6.2)).toBeLessThan(1);
    expect(homeMatthiasSipWeight(9)).toBe(0);
  });

  it('shapes the blanket over feet, slim skirt and waist', () => {
    const feet = homeMatthiasBlanketProfile(0.07);
    const skirt = homeMatthiasBlanketProfile(0.4);
    const waist = homeMatthiasBlanketProfile(1);
    expect(skirt).toBeGreaterThan(0.25);
    expect(waist).toBeGreaterThan(skirt);
    expect(feet).toBeGreaterThan(0.2);
  });

  it('converts the authored Blender frame to the runtime Y-up frame', () => {
    expect(homeMatthiasBlenderToThree([4.12, 1.05, 0.855])).toEqual({ x: 4.12, y: 0.855, z: -1.05 });
  });

  it('projects actor bounds into stage fractions for the DOM hit-area', () => {
    const camera = new THREE.PerspectiveCamera(22.9, 16 / 9, 0.1, 80);
    camera.position.set(0, 4.85, 16);
    camera.lookAt(0, 1.55, -2.3);
    camera.updateMatrixWorld(true);
    const box = new THREE.Box3(new THREE.Vector3(4.1, 0, 0), new THREE.Vector3(5.1, 1.9, 0.9));
    const rect = homeMatthiasProjectBounds(box, camera);
    expect(rect.left).toBeGreaterThan(0.5);
    expect(rect.left + rect.width).toBeLessThanOrEqual(1);
    expect(rect.top).toBeGreaterThan(0.2);
    expect(rect.height).toBeGreaterThan(0.1);
    expect(homeMatthiasProjectBounds(new THREE.Box3(), camera)).toBeNull();
  });
});
