import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  HOME_MATTHIAS_ACTOR_SCALE,
  HOME_MATTHIAS_CADENCE,
  homeMatthiasCadenceStep,
  HOME_MATTHIAS_ACTOR_STATIONS,
  HOME_MATTHIAS_ARM_POSES,
  HOME_MATTHIAS_POSTURES,
  HOME_MATTHIAS_PROP_ANCHORS,
  HOME_MATTHIAS_BLANKET,
  HOME_MATTHIAS_SLEEP_FACE,
  homeMatthiasZzzFrame,
  createHomeMatthiasActor,
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

  it('drapes the blanket wide over the cushion instead of a tube', () => {
    const body = homeMatthiasBlanketProfile(0.4) + 0.06;
    // The dome is wider than it is tall, and the sheet reaches past it.
    expect(HOME_MATTHIAS_BLANKET.spreadX * body).toBeGreaterThan(HOME_MATTHIAS_BLANKET.rise * body * 1.4);
    expect(HOME_MATTHIAS_BLANKET.width / 2).toBeGreaterThan(HOME_MATTHIAS_BLANKET.spreadX * body);
  });

  it('sleeps bald with closed eyes and drifting Z\'s', () => {
    expect(HOME_MATTHIAS_SLEEP_FACE.closedEyeScale).toBeLessThan(0.25);
    const frames = [0, 1, 2].map((index) => homeMatthiasZzzFrame(1.3, index));
    // Staggered along the climb, never all at once.
    expect(new Set(frames.map((frame) => frame.t.toFixed(2))).size).toBe(3);
    const start = homeMatthiasZzzFrame(0.01, 0);
    const late = homeMatthiasZzzFrame(HOME_MATTHIAS_SLEEP_FACE.zzz.period * 0.6, 0);
    expect(late.rise).toBeGreaterThan(start.rise);
    expect(late.scale).toBeGreaterThan(start.scale);
    expect(start.opacity).toBeLessThan(0.2);
    expect(homeMatthiasZzzFrame(HOME_MATTHIAS_SLEEP_FACE.zzz.period * 0.99, 0).opacity).toBeLessThan(0.1);
  });

  it('sleeps with slack arms along the flank, never pointing at the ceiling', async () => {
    const file = readFileSync(new URL('../../public/models/matthias-home-canonical.glb', import.meta.url));
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
    const actor = createHomeMatthiasActor(gltf, { shadowsEnabled: false, random: () => 0.5 });
    actor.setRoutine({ profile: 'sleep', clip: 'Sleep', phase: 0, stationId: 'sofa-nap', posture: 'lie', propProfile: 'sleep' });
    actor.update(0.05);
    actor.object.updateMatrixWorld(true);
    const key = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const find = (name) => {
      let found = null;
      gltf.scene.traverse((node) => { if (!found && key(node.name) === key(name)) found = node; });
      return found;
    };
    const toBody = new THREE.Matrix4().copy(gltf.scene.matrixWorld).invert();
    for (const side of ['L', 'R']) {
      const hand = new THREE.Box3().setFromObject(find(`Hand.${side}`)).getCenter(new THREE.Vector3()).applyMatrix4(toBody);
      const shoulder = new THREE.Vector3().setFromMatrixPosition(find(`upper_arm.${side}`).matrixWorld).applyMatrix4(toBody);
      // In the body frame (as if standing): the glove hangs to the hip.
      expect(hand.y - shoulder.y).toBeLessThan(-0.3);
    }
    // Bald and eyes shut while asleep.
    expect(find('Classic cap top').visible).toBe(false);
    expect(find('Eye.L').scale.y).toBeLessThan(0.3);
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

describe('Home Matthias human cadence', () => {
  const run = (clipName, duration, seconds, random = () => 0.5) => {
    let state = { mode: 'play', time: 0, speed: 1, restLeft: 0 };
    const samples = [];
    for (let t = 0; t < seconds; t += 0.1) {
      state = homeMatthiasCadenceStep(state, { clipName, duration, dt: 0.1, random });
      samples.push(state);
    }
    return samples;
  };

  it('sleep settles into its deepest frame and never snaps back to the first one', () => {
    const duration = 104 / 24;
    const samples = run('Sleep', duration, 180);
    const settle = duration * HOME_MATTHIAS_CADENCE.Sleep.settle;
    const shiftFrom = duration * HOME_MATTHIAS_CADENCE.Sleep.shiftFrom;
    expect(Math.max(...samples.map((s) => s.time))).toBeCloseTo(settle, 5);
    // After the first settle the head never goes back above the re-settle frame.
    const firstRest = samples.findIndex((s) => s.mode === 'rest');
    expect(firstRest).toBeGreaterThan(0);
    expect(Math.min(...samples.slice(firstRest).map((s) => s.time))).toBeGreaterThanOrEqual(shiftFrom - 1e-9);
    // Long, breathing rests: at most a few shifts in three minutes.
    const shifts = samples.filter((s, i) => i > 0 && s.mode === 'play' && samples[i - 1].mode === 'rest').length;
    expect(shifts).toBeLessThanOrEqual(4);
  });

  it('gestures rest between plays for an irregular time at a varying speed', () => {
    const values = [0.1, 0.9, 0.4, 0.7, 0.2, 0.95, 0.3];
    let i = 0;
    const random = () => values[i++ % values.length];
    const samples = run('Idle', 112 / 24, 60, random);
    const rests = [];
    let current = 0;
    samples.forEach((s, index) => {
      if (s.mode === 'rest') current += 0.1;
      else if (index > 0 && samples[index - 1].mode === 'rest') { rests.push(current); current = 0; }
    });
    expect(rests.length).toBeGreaterThanOrEqual(3);
    expect(new Set(rests.map((r) => r.toFixed(1))).size).toBeGreaterThan(1);
    const speeds = new Set(samples.map((s) => s.speed.toFixed(3)));
    expect(speeds.size).toBeGreaterThan(1);
  });

  it('sip raise follows the cycle length it is given', () => {
    expect(homeMatthiasSipWeight(0, 12)).toBe(0);
    expect(homeMatthiasSipWeight(12 - 2.6, 12)).toBe(1);
    expect(homeMatthiasSipWeight(12 - 1, 12)).toBe(0);
    // The historical 9.6 s cycle is unchanged.
    expect(homeMatthiasSipWeight(7, 9.6)).toBe(1);
  });
});
