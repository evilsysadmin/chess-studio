import * as THREE from 'three';
import {
  homeMatthiasClipForProfile,
  homeMatthiasLimbScaleForMesh,
  homeMatthiasMotionPhase,
  homeMatthiasMotionProfile,
} from './HomeMatthias3D.jsx';

// Matthias as a resident of the Blender hall, not a portrait pasted over it.
// The canonical rig is loaded into the same Three scene, camera and lights as
// the room and anchored to real furniture in world space: standing on the
// floor, sitting on a chair or lying on the sofa. Coordinates below use the
// authored Blender frame of build_home_v2_blockout.py (x right, y depth away
// from the camera, z up); the runtime scene is exported Y-up, so Blender
// (x, y, z) becomes three (x, z, -y).
export const HOME_MATTHIAS_ACTOR_MODEL_PATH = 'models/matthias-home-canonical.glb';
export const HOME_MATTHIAS_ACTOR_SCALE = 0.88;

// Seat/cushion heights come from build_home_v2_blockout.py (castle chair seat
// cushion top 0.855, sofa seat cushions ~0.86). `yawDeg` turns the actor about
// the up axis: 0 faces the hall camera, -90 faces -x (the table from the right
// chair), +90 faces +x (the table from the left chair).
export const HOME_MATTHIAS_ACTOR_STATIONS = Object.freeze({
  // On the floor in front of the left corner of the table. The right side of
  // the hall is not available to him: the stairs carry the Mazmorras
  // hotspot, a large hit-area that would sit on top of his own.
  'table-coffee': Object.freeze({
    posture: 'stand',
    at: Object.freeze([-3.05, -1.35, 0]),
    yawDeg: 18,
  }),
  // Mirror spot at the left end of the table, by the left hearth.
  'hearth-files': Object.freeze({
    posture: 'stand',
    at: Object.freeze([-4.6, -0.1, 0]),
    yawDeg: 28,
  }),
  // Both seated routines use the right chair, the end of the table that has
  // his small board, his books and his mug. Slightly forward on the seat so
  // the cap clears the high backrest posts. On screen it overlaps the
  // Mazmorras hotspot box, so HomeMatthiasInScene.css stacks his hit-area
  // above it on desktop.
  'chess-chair': Object.freeze({
    posture: 'seat',
    at: Object.freeze([4.06, 1.05, 0.855]),
    yawDeg: -70,
  }),
  'reading-chair': Object.freeze({
    posture: 'seat',
    at: Object.freeze([4.06, 1.05, 0.855]),
    yawDeg: -70,
  }),
  // The daybed on the left: high end against the wall (x -7.39), low arm at
  // x -5.45, seat cushions x -7.25..-5.68 with their top at ~0.965. Matthias
  // lies along it with his head propped on the low arm, towards the hall, so
  // his face stays readable, feet towards the high end under the blanket.
  // `at` is the base of his pawn body (the rig origin) for this posture.
  'sofa-nap': Object.freeze({
    posture: 'lie',
    at: Object.freeze([-6.6, -0.1, 1.3]),
    yawDeg: -90,
  }),
});

const STATION_BY_PROFILE = Object.freeze({
  idle: 'table-coffee',
  speak: 'table-coffee',
  sip: 'table-coffee',
  bite: 'table-coffee',
  dossier: 'hearth-files',
  think: 'chess-chair',
  read: 'reading-chair',
  write: 'reading-chair',
  sleep: 'sofa-nap',
});

export function homeMatthiasActorStationForProfile(profile = 'idle') {
  return STATION_BY_PROFILE[profile] || STATION_BY_PROFILE.idle;
}

export function homeMatthiasActorRoutine({ scene = '', activity = '', speaking = false } = {}) {
  const profile = homeMatthiasMotionProfile({ scene, activity, speaking });
  // "Dormido sobre el manual": he nods off in the reading chair with the
  // manual still in his hands, not on the sofa.
  const bookDoze = profile === 'sleep' && /book-doze/i.test(String(scene));
  const stationId = bookDoze ? 'reading-chair' : homeMatthiasActorStationForProfile(profile);
  const propProfile = bookDoze ? 'read' : profile;
  const station = HOME_MATTHIAS_ACTOR_STATIONS[stationId];
  return {
    profile,
    clip: homeMatthiasClipForProfile(profile),
    phase: homeMatthiasMotionPhase({ scene, activity }),
    stationId,
    posture: station.posture,
    propProfile,
  };
}

export function homeMatthiasBlenderToThree([x, y, z] = [0, 0, 0]) {
  return { x: Number(x) || 0, y: Number(z) || 0, z: -(Number(y) || 0) };
}

// Pawn-first posture language. The lower pawn body is rigid in the canonical
// rig, so seated and lying poses adapt that mesh instead of keeping an absurd
// rigid plinth: sitting turns it into a short draped skirt on the cushion,
// lying slims it so the blanket reads as a body, not a barrel.
export const HOME_MATTHIAS_POSTURES = Object.freeze({
  stand: Object.freeze({
    skirtY: 1,
    skirtXZ: 1,
    // The rest pose hangs the boots ~0.23 below the plinth, which leaves a
    // tall gap under the bell and reads as hovering. Tuck the hips up inside
    // the skirt so only the boots peek out under the front rim, and lift the
    // rig just enough for the soles to rest on the floor.
    lift: 0.062,
    legs: Object.freeze({
      hipY: 0.27,
      hipZ: 0.24,
      hipX: 0.19,
      thighPitchDeg: 0,
      kneePitchDeg: 0,
      splayDeg: 0,
    }),
  }),
  seat: Object.freeze({
    // Near-uniform shrink of the lower pawn: a shorter bell that keeps its
    // shape. A strong vertical squash read as a deformed body.
    skirtY: 0.62,
    skirtXZ: 0.72,
    // Seated, the draped skirt rests directly on the cushion.
    lift: 0.0,
    legs: Object.freeze({
      hipY: 0.07,
      hipZ: 0.27,
      hipX: 0.15,
      thighPitchDeg: 74,
      kneePitchDeg: -80,
      splayDeg: 7,
    }),
  }),
  lie: Object.freeze({
    skirtY: 0.78,
    skirtXZ: 0.62,
    lift: 0.0,
    legs: Object.freeze({
      hipY: 0.08,
      hipZ: 0.04,
      hipX: 0.13,
      thighPitchDeg: 0,
      kneePitchDeg: 6,
      splayDeg: 2,
    }),
  }),
});

// Real arms reach the routine props instead of leaving the props floating
// beside dangling arms. Angles are Euler degrees on the canonical rig bones
// (+x swings an arm forward, +z swings the right arm inwards; the left arm
// mirrors z). `raise` is the sip/bite gesture blended in by the cycle below.
export const HOME_MATTHIAS_ARM_POSES = Object.freeze({
  sip: Object.freeze({
    R: Object.freeze({ upper: [40, 0, 20], fore: [70, 0, 0], raise: { upper: [52, 0, 30], fore: [100, 0, 0] } }),
  }),
  // Same hand as the coffee: the authored sandwich sits on the right side of
  // the chest, so a left-hand anchor dragged it across the body.
  bite: Object.freeze({
    R: Object.freeze({ upper: [40, 0, 20], fore: [70, 0, 0], raise: { upper: [52, 0, 30], fore: [100, 0, 0] } }),
  }),
  // At the board: both forearms forward, hands resting near the pieces.
  think: Object.freeze({
    R: Object.freeze({ upper: [36, 0, 18], fore: [62, 0, 0] }),
    L: Object.freeze({ upper: [36, 0, 18], fore: [62, 0, 0] }),
  }),
  dossier: Object.freeze({
    R: Object.freeze({ upper: [40, 0, 20], fore: [70, 0, 0] }),
    L: Object.freeze({ upper: [40, 0, 20], fore: [70, 0, 0] }),
  }),
  read: Object.freeze({
    R: Object.freeze({ upper: [40, 0, 20], fore: [70, 0, 0] }),
    L: Object.freeze({ upper: [40, 0, 20], fore: [70, 0, 0] }),
  }),
  write: Object.freeze({
    R: Object.freeze({ upper: [44, 0, 24], fore: [74, 0, 0] }),
    L: Object.freeze({ upper: [40, 0, 20], fore: [70, 0, 0] }),
  }),
});

// Props that the rig carries with a modelled "fake" hand get anchored to the
// real hand instead, and the fake hand is hidden.
export const HOME_MATTHIAS_PROP_ANCHORS = Object.freeze({
  // `show` keeps the prop in hand for the whole routine: the authored clips
  // hide their props for a few frames at every loop seam, which reads as a
  // blinking cup once the routine lasts tens of seconds.
  sip: Object.freeze({ bone: 'prop_cup', content: 'RoutineCup', hand: 'Hand.R', offset: [-0.045, 0.07, 0.03], hide: ['RoutineCupHand'], show: ['prop_cup'] }),
  bite: Object.freeze({ bone: 'prop_bite', content: 'RoutineSandwichBread', hand: 'Hand.R', offset: [-0.045, 0.06, 0.03], hide: ['RoutineSandwichHand'], show: ['prop_bite'] }),
  dossier: Object.freeze({ hide: ['RoutineBookHand.L', 'RoutineBookHand.R'], show: ['prop_book'] }),
  read: Object.freeze({ hide: ['RoutineBookHand.L', 'RoutineBookHand.R'], show: ['prop_book'] }),
  write: Object.freeze({ hide: ['RoutineBookHand.L', 'RoutineBookHand.R'], show: ['prop_book', 'prop_pen'] }),
});

// 0 holding the cup at the chest, 1 at the mouth; a slow sip every ~9.6 s.
// The sip/bite raise sits at the end of each cycle; the actor varies the
// cycle length so the cup does not come up on a metronome.
export function homeMatthiasSipWeight(elapsedSeconds = 0, cycle = 9.6) {
  const length = Math.max(4, Number(cycle) || 9.6);
  const t = ((Number(elapsedSeconds) || 0) % length + length) % length;
  const start = length - 3.8;
  const top = length - 2.9;
  const lower = length - 2.35;
  const end = length - 1.4;
  if (t < start || t >= end) return 0;
  if (t < top) return THREE.MathUtils.smoothstep(t, start, top);
  if (t < lower) return 1;
  return 1 - THREE.MathUtils.smoothstep(t, lower, end);
}

export const HOME_MATTHIAS_SIP_CYCLE_SECONDS = Object.freeze([8, 19]);

export function homeMatthiasPostureSpec(posture = 'stand') {
  return HOME_MATTHIAS_POSTURES[posture] || HOME_MATTHIAS_POSTURES.stand;
}

// Height in rig units where the lower pawn body meets the tunic (rest pose).
const SKIRT_TOP = 0.655;
const SPINE_REST_Y = 0.5;

export function homeMatthiasSpineDrop(posture = 'stand') {
  const spec = homeMatthiasPostureSpec(posture);
  return SKIRT_TOP * (1 - spec.skirtY);
}

// Lying: on the back, face up, head away from the camera towards the sofa's
// far cushion, propped on the gold pillow so the stern face stays readable.
export const HOME_MATTHIAS_LIE_POSE = Object.freeze({
  // Pitch -90 lays him on his back; the remainder props the head on the arm.
  pitchDeg: -90 + 12,
  // Roll about the body axis: a side nap facing the hall camera, so the
  // stern sleeping face reads from the canonical Home view.
  rollDeg: 58,
  // Arms gone slack: hanging along the flank towards the hips, elbows a bit
  // bent, gloves resting on the cushion/blanket. The overrides replace the
  // bone rotation outright and a zero rotation points the arm at the head,
  // so the old chest fold left the hands pointing at the ceiling.
  arms: Object.freeze({ upperPitchDeg: 150, upperSplayDeg: -10, forePitchDeg: 20 }),
});

function eulerDeg(x = 0, y = 0, z = 0) {
  return new THREE.Euler(
    THREE.MathUtils.degToRad(x),
    THREE.MathUtils.degToRad(y),
    THREE.MathUtils.degToRad(z),
  );
}

function plaidTexture() {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#5a1a1c';
  ctx.fillRect(0, 0, size, size);
  const bands = [
    [0, 22, 'rgba(26, 14, 12, .55)'],
    [44, 6, 'rgba(176, 132, 64, .55)'],
    [70, 22, 'rgba(26, 14, 12, .45)'],
    [104, 4, 'rgba(176, 132, 64, .45)'],
  ];
  for (const [start, width, color] of bands) {
    ctx.fillStyle = color;
    ctx.fillRect(start, 0, width, size);
    ctx.fillRect(0, start, size, width);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 2.6);
  return texture;
}

// Blanket extent along the lying body, in rig units (rest pose: boots at
// -0.23, skirt top 0.655 squashed by the lie posture, hands at ~0.65).
export const HOME_MATTHIAS_BLANKET = Object.freeze({
  fromY: -0.3,
  toY: 0.74,
  centerY: 0.22,
  // Wide enough to drape over the cushion on both sides: a narrow sheet
  // hugging the body read as a plaid tube.
  width: 2.0,
  // Cloth stands off the body sideways more than upwards (a wide, low dome).
  spreadX: 1.42,
  rise: 0.86,
  // Span over which the cloth falls from the dome to the cushion.
  fall: 0.34,
  // Distance from the body axis down to the cushion, in rig units.
  seatDrop: 0.42,
});

// Body radius (rig units) under the blanket along the body axis, t: 0 feet,
// 1 waist. Feet bump -> slim lying skirt -> start of the tunic.
export function homeMatthiasBlanketProfile(t = 0) {
  const u = THREE.MathUtils.clamp(Number(t) || 0, 0, 1);
  const feet = 0.2 * Math.exp(-((u - 0.07) ** 2) / 0.006);
  const skirt = 0.3 + 0.08 * u;
  const waist = 0.47 * THREE.MathUtils.smoothstep(u, 0.72, 1.0);
  return Math.max(feet, skirt, waist);
}

// A draped wool blanket shaped over the lying body. Built in the body frame:
// x across, y along it (feet -> waist), z towards the face (up when lying).
// Outside the body silhouette the cloth falls to the cushion instead of
// hovering, with a few soft folds.
export function createHomeMatthiasBlanket({ segments = 30 } = {}) {
  const spec = HOME_MATTHIAS_BLANKET;
  const scale = HOME_MATTHIAS_ACTOR_SCALE;
  const length = (spec.toY - spec.fromY) * scale;
  const width = spec.width * scale;
  const geometry = new THREE.PlaneGeometry(width, length, segments, segments);
  const position = geometry.getAttribute('position');
  const drop = spec.seatDrop * scale;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const t = (y + length / 2) / length;
    const radius = (homeMatthiasBlanketProfile(t) + 0.06) * scale;
    const halfWidth = radius * spec.spreadX;
    const across = Math.abs(x) / halfWidth;
    let z;
    if (across < 1) {
      z = radius * spec.rise * Math.sqrt(1 - across * across);
    } else {
      // Fall from the silhouette edge to the cushion, loose rather than tucked.
      const fall = THREE.MathUtils.clamp((Math.abs(x) - halfWidth) / (spec.fall * scale), 0, 1);
      z = -drop * THREE.MathUtils.smoothstep(fall, 0, 1);
    }
    const fold = 0.014 * scale * Math.sin(y * 19 + x * 4) * Math.sin(x * 11);
    position.setZ(index, z + fold);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: plaidTexture(),
    roughness: 0.93,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const blanket = new THREE.Mesh(geometry, material);
  blanket.name = 'Matthias sofa blanket';
  return blanket;
}

// Asleep he is a bald pawn: the cap comes off, the eyes close to thin lids
// and a few Z's drift up from his head.
export const HOME_MATTHIAS_SLEEP_FACE = Object.freeze({
  capPrefix: 'classiccap',
  eyes: Object.freeze(['Eye.L', 'Eye.R']),
  closedEyeScale: 0.14,
  zzz: Object.freeze({ count: 3, period: 4.2, rise: 0.7, drift: 0.22, size: 0.28 }),
});

// One drifting Z: t in [0, 1) along its climb. Fades in, grows, fades out.
export function homeMatthiasZzzFrame(elapsed = 0, index = 0) {
  const spec = HOME_MATTHIAS_SLEEP_FACE.zzz;
  const raw = ((Number(elapsed) || 0) / spec.period) + index / spec.count;
  const t = raw - Math.floor(raw);
  const opacity = Math.min(1, t / 0.18) * Math.min(1, (1 - t) / 0.35);
  return {
    t,
    rise: spec.rise * t,
    drift: spec.drift * Math.sin(t * Math.PI * 1.6 + index),
    scale: spec.size * (0.55 + 0.6 * t),
    opacity: Math.max(0, opacity),
  };
}

function zzzTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = 'bold 52px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(40, 28, 18, 0.85)';
  ctx.strokeText('z', 32, 34);
  ctx.fillStyle = '#f4e6c4';
  ctx.fillText('z', 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createHomeMatthiasZzz() {
  const group = new THREE.Group();
  group.name = 'Matthias sleep zzz';
  const map = zzzTexture();
  for (let index = 0; index < HOME_MATTHIAS_SLEEP_FACE.zzz.count; index += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    }));
    sprite.name = `Matthias sleep z ${index + 1}`;
    sprite.renderOrder = 3;
    group.add(sprite);
  }
  group.visible = false;
  return group;
}

function createContactShadowTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(8, 5, 3, .78)');
  gradient.addColorStop(0.55, 'rgba(8, 5, 3, .42)');
  gradient.addColorStop(1, 'rgba(8, 5, 3, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createContactShadow() {
  const map = createContactShadowTexture();
  const material = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    opacity: 0.8,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.name = 'Matthias contact shadow';
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  return mesh;
}

function disposeObject(root) {
  root?.traverse?.((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
      }
      material.dispose?.();
    }
  });
}

function findBone(model, name) {
  const wanted = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
  let found = null;
  model.traverse((node) => {
    if (found) return;
    if (String(node.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '') === wanted) found = node;
  });
  return found;
}

// Projects the actor's world bounds into canvas fractions (0..1) so the DOM
// hit-area can sit exactly over the resident.
export function homeMatthiasProjectBounds(box, camera) {
  if (!box || box.isEmpty?.() || !camera) return null;
  camera.updateMatrixWorld?.(true);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const point = new THREE.Vector3(x, y, z).project(camera);
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.z > 1) continue;
        const sx = point.x * 0.5 + 0.5;
        const sy = 1 - (point.y * 0.5 + 0.5);
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  const round = (value) => Math.round(THREE.MathUtils.clamp(value, 0, 1) * 10000) / 10000;
  return {
    left: round(minX),
    top: round(minY),
    width: round(maxX - minX),
    height: round(maxY - minY),
  };
}

// Human cadence for the authored clips. Looping a 3-4 s clip forever reads as
// a machine: every loop snaps back to its first frame (asleep, his head
// popped up and lay down again every four seconds). Instead each gesture plays
// once, rests on its last frame for an irregular pause and comes back at a
// slightly different speed. Sleep settles into its deepest frame and stays
// there breathing, shifting only now and then.
export const HOME_MATTHIAS_CADENCE = Object.freeze({
  default: Object.freeze({ restSeconds: Object.freeze([1.6, 6.5]), speed: Object.freeze([0.84, 1.16]) }),
  Speak: Object.freeze({ restSeconds: Object.freeze([0.25, 1.4]), speed: Object.freeze([0.9, 1.12]) }),
  Sleep: Object.freeze({
    settle: 0.69, // deepest frame of the Sleep action (72/104)
    shiftFrom: 0.38, // a small re-settle: head and shoulders shift, never lift
    restSeconds: Object.freeze([26, 70]),
    speed: Object.freeze([0.55, 0.8]),
    breathSeconds: 5.2,
  }),
});

export function homeMatthiasCadence(clipName = '') {
  return HOME_MATTHIAS_CADENCE[clipName] || HOME_MATTHIAS_CADENCE.default;
}

function between([low, high], random) {
  return low + (high - low) * Math.min(1, Math.max(0, random()));
}

// Pure step of the cadence: given the clip state, decides whether to keep
// playing, start a rest or replay. Kept separate so it can be tested without
// Three.
export function homeMatthiasCadenceStep(state, { clipName, duration, dt, random = Math.random }) {
  const cadence = homeMatthiasCadence(clipName);
  const next = { ...state };
  if (next.mode === 'rest') {
    next.restLeft -= dt;
    if (next.restLeft > 0) return next;
    next.mode = 'play';
    next.speed = between(cadence.speed, random);
    next.time = cadence.settle !== undefined ? duration * cadence.shiftFrom : 0;
    return next;
  }
  next.time += dt * (next.speed || 1);
  const end = cadence.settle !== undefined ? duration * cadence.settle : duration;
  if (next.time >= end) {
    next.time = end;
    next.mode = 'rest';
    next.restLeft = between(cadence.restSeconds, random);
  }
  return next;
}

export function createHomeMatthiasActor(gltf, { shadowsEnabled = true, random = Math.random } = {}) {
  const model = gltf.scene;
  const clips = new Map((gltf.animations || []).map((clip) => [clip.name, clip]));
  const actor = new THREE.Group();
  actor.name = 'Matthias resident';
  const body = new THREE.Group();
  body.name = 'Matthias posture';
  actor.add(body);
  body.add(model);
  model.scale.setScalar(HOME_MATTHIAS_ACTOR_SCALE);

  const root = findBone(model, 'root');
  const spine = findBone(model, 'spine');
  const arms = ['L', 'R'].map((side) => ({
    side,
    sign: side === 'L' ? -1 : 1,
    upper: findBone(model, `upper_arm.${side}`),
    fore: findBone(model, `forearm.${side}`),
  }));
  const legs = ['L', 'R'].map((side) => ({
    side,
    sign: side === 'L' ? -1 : 1,
    upper: findBone(model, `upper_leg.${side}`),
    lower: findBone(model, `lower_leg.${side}`),
  }));
  for (const leg of legs) {
    leg.restPosition = leg.upper?.position.clone() || null;
  }
  // Rigid lower pawn meshes parented straight to `root` (plinth, skirt, brass
  // lines). These are what each posture adapts.
  const skirtMeshes = [];
  root?.children?.forEach((child) => {
    if (child.isMesh) {
      skirtMeshes.push({
        node: child,
        position: child.position.clone(),
        scale: child.scale.clone(),
      });
    }
  });

  model.traverse((node) => {
    if (!node.isMesh) return;
    const limbScale = homeMatthiasLimbScaleForMesh(node.name);
    if (limbScale !== 1) node.scale.multiplyScalar(limbScale);
    node.castShadow = shadowsEnabled;
    node.receiveShadow = shadowsEnabled;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      material.dithering = true;
      material.needsUpdate = true;
    }
  });

  const contactShadow = createContactShadow();
  actor.add(contactShadow);
  let blanket = null;

  const mixer = new THREE.AnimationMixer(model);
  let action = null;
  let routine = null;
  let still = false;
  let cadence = { mode: 'play', time: 0, speed: 1, restLeft: 0 };
  let breathElapsed = 0;
  let sipCycleStart = 0;
  let sipCycle = 9.6;
  const head = findBone(model, 'head');
  const capNodes = [];
  model.traverse((node) => {
    const key = String(node.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (key.startsWith(HOME_MATTHIAS_SLEEP_FACE.capPrefix)) capNodes.push(node);
  });
  const eyeNodes = HOME_MATTHIAS_SLEEP_FACE.eyes
    .map((name) => findBone(model, name))
    .filter(Boolean)
    .map((node) => ({ node, restY: node.scale.y }));
  const zzz = createHomeMatthiasZzz();
  actor.add(zzz);
  const headWorld = new THREE.Vector3();
  let asleep = false;
  let zzzElapsed = 0;

  const applySleepFace = () => {
    asleep = routine?.posture === 'lie';
    for (const node of capNodes) node.visible = !asleep;
    for (const eye of eyeNodes) {
      eye.node.scale.y = eye.restY * (asleep ? HOME_MATTHIAS_SLEEP_FACE.closedEyeScale : 1);
    }
    zzz.visible = asleep && Boolean(head);
  };

  const placeZzz = () => {
    if (!zzz.visible || !head) return;
    actor.updateMatrixWorld(true);
    head.getWorldPosition(headWorld);
    actor.worldToLocal(headWorld);
    const unit = HOME_MATTHIAS_ACTOR_SCALE;
    zzz.children.forEach((sprite, index) => {
      const frame = homeMatthiasZzzFrame(zzzElapsed, index);
      sprite.position.set(
        headWorld.x + frame.drift * unit,
        headWorld.y + (0.42 + frame.rise) * unit,
        headWorld.z,
      );
      sprite.scale.setScalar(frame.scale * unit);
      sprite.material.opacity = frame.opacity;
    });
  };

  const applySkirt = (spec) => {
    for (const item of skirtMeshes) {
      item.node.position.set(item.position.x, item.position.y * spec.skirtY, item.position.z);
      item.node.scale.set(
        item.scale.x * spec.skirtXZ,
        item.scale.y * spec.skirtY,
        item.scale.z * spec.skirtXZ,
      );
    }
  };

  let gestureElapsed = 0;
  const propNodes = new Map();
  model.traverse((node) => {
    const key = String(node.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (key && !propNodes.has(key)) propNodes.set(key, node);
  });
  const propNode = (name) => propNodes.get(String(name).toLowerCase().replace(/[^a-z0-9]+/g, '')) || null;
  const hiddenByPolicy = new Set();
  const applyPropVisibility = () => {
    for (const node of hiddenByPolicy) node.visible = true;
    hiddenByPolicy.clear();
    for (const name of HOME_MATTHIAS_PROP_ANCHORS[routine?.propProfile || routine?.profile]?.hide || []) {
      const node = propNode(name);
      if (!node) continue;
      node.visible = false;
      hiddenByPolicy.add(node);
    }
  };
  const anchorWorld = new THREE.Vector3();
  const contentWorld = new THREE.Vector3();
  const anchorBox = new THREE.Box3();
  const parentQuaternion = new THREE.Quaternion();
  const parentScale = new THREE.Vector3();
  // Moves the prop bone so the prop's visible centre sits in the real hand.
  const anchorRoutineProp = () => {
    const spec = HOME_MATTHIAS_PROP_ANCHORS[routine?.propProfile || routine?.profile];
    for (const name of spec?.show || []) propNode(name)?.scale.set(1, 1, 1);
    if (!spec?.bone) return;
    const bone = propNode(spec.bone);
    const content = propNode(spec.content);
    const hand = propNode(spec.hand);
    if (!bone?.parent || !content || !hand) return;
    model.updateMatrixWorld(true);
    anchorBox.setFromObject(hand).getCenter(anchorWorld);
    anchorBox.setFromObject(content).getCenter(contentWorld);
    if (anchorBox.isEmpty()) return;
    // Offsets are in rig units along the body's own axes.
    const offset = new THREE.Vector3(...spec.offset)
      .multiplyScalar(HOME_MATTHIAS_ACTOR_SCALE)
      .applyQuaternion(model.getWorldQuaternion(parentQuaternion));
    const delta = anchorWorld.add(offset).sub(contentWorld);
    bone.parent.getWorldQuaternion(parentQuaternion).invert();
    bone.parent.getWorldScale(parentScale);
    delta.applyQuaternion(parentQuaternion);
    delta.set(
      delta.x / Math.max(Math.abs(parentScale.x), 1e-6),
      delta.y / Math.max(Math.abs(parentScale.y), 1e-6),
      delta.z / Math.max(Math.abs(parentScale.z), 1e-6),
    );
    bone.position.add(delta);
    bone.updateMatrixWorld(true);
  };

  const legQuaternion = new THREE.Quaternion();
  const kneeQuaternion = new THREE.Quaternion();
  // Runs after every mixer update: the authored clips key every bone, so the
  // posture overrides must be re-applied on top of them each frame.
  const applyPostureBones = () => {
    if (!routine) return;
    const spec = homeMatthiasPostureSpec(routine.posture);
    if (spine) spine.position.y = SPINE_REST_Y - homeMatthiasSpineDrop(routine.posture);
    if (routine.posture === 'lie') {
      const fold = HOME_MATTHIAS_LIE_POSE.arms;
      for (const arm of arms) {
        if (!arm.upper || !arm.fore) continue;
        arm.upper.quaternion.setFromEuler(eulerDeg(fold.upperPitchDeg, 0, arm.sign * fold.upperSplayDeg));
        arm.fore.quaternion.setFromEuler(eulerDeg(fold.forePitchDeg, 0, 0));
      }
    } else {
      const armPose = HOME_MATTHIAS_ARM_POSES[routine.propProfile || routine.profile];
      if (gestureElapsed - sipCycleStart >= sipCycle) {
        sipCycleStart += sipCycle;
        sipCycle = between(HOME_MATTHIAS_SIP_CYCLE_SECONDS, random);
      }
      const weight = still ? 0 : homeMatthiasSipWeight(gestureElapsed - sipCycleStart, sipCycle);
      for (const arm of arms) {
        const pose = armPose?.[arm.side];
        if (!pose || !arm.upper || !arm.fore) continue;
        const mix = (base, raised = base, axis) => base[axis] + ((raised[axis] - base[axis]) * weight);
        const upperRaise = pose.raise?.upper || pose.upper;
        const foreRaise = pose.raise?.fore || pose.fore;
        arm.upper.quaternion.setFromEuler(eulerDeg(
          mix(pose.upper, upperRaise, 0),
          mix(pose.upper, upperRaise, 1),
          arm.sign * mix(pose.upper, upperRaise, 2),
        ));
        arm.fore.quaternion.setFromEuler(eulerDeg(
          mix(pose.fore, foreRaise, 0),
          mix(pose.fore, foreRaise, 1),
          arm.sign * mix(pose.fore, foreRaise, 2),
        ));
      }
    }
    anchorRoutineProp();
    if (!spec.legs) return;
    for (const leg of legs) {
      if (!leg.upper || !leg.lower) continue;
      leg.upper.position.set(leg.sign * spec.legs.hipX, spec.legs.hipY, spec.legs.hipZ);
      legQuaternion.setFromEuler(eulerDeg(spec.legs.thighPitchDeg, 0, leg.sign * spec.legs.splayDeg));
      leg.upper.quaternion.copy(legQuaternion);
      kneeQuaternion.setFromEuler(eulerDeg(spec.legs.kneePitchDeg, 0, 0));
      leg.lower.quaternion.copy(kneeQuaternion);
    }
  };

  const restoreLegs = () => {
    for (const leg of legs) {
      if (leg.upper && leg.restPosition) leg.upper.position.copy(leg.restPosition);
    }
  };

  const placeAtStation = () => {
    const station = HOME_MATTHIAS_ACTOR_STATIONS[routine.stationId];
    const spec = homeMatthiasPostureSpec(station.posture);
    const world = homeMatthiasBlenderToThree(station.at);
    actor.position.set(world.x, world.y, world.z);
    actor.rotation.set(0, THREE.MathUtils.degToRad(station.yawDeg), 0);
    body.position.set(0, spec.lift * HOME_MATTHIAS_ACTOR_SCALE, 0);
    body.rotation.set(0, 0, 0);
    applySkirt(spec);
    if (spec.legs) applyPostureBones();
    else restoreLegs();

    if (station.posture === 'lie') {
      const pose = HOME_MATTHIAS_LIE_POSE;
      body.position.set(0, 0, 0);
      // XYZ order: roll about the body axis first, then lay the body down.
      body.rotation.copy(eulerDeg(pose.pitchDeg, pose.rollDeg, 0));
      if (!blanket) {
        blanket = createHomeMatthiasBlanket();
        blanket.castShadow = false;
        blanket.receiveShadow = shadowsEnabled;
        body.add(blanket);
      }
      // The blanket lives in the body frame (x across, y along feet -> chest,
      // z towards the face): boots to waist, under his folded hands.
      blanket.visible = true;
      blanket.position.set(0, HOME_MATTHIAS_BLANKET.centerY * HOME_MATTHIAS_ACTOR_SCALE, 0);
      blanket.rotation.set(0, 0, 0);
      contactShadow.visible = false;
    } else {
      if (blanket) blanket.visible = false;
      contactShadow.visible = station.posture === 'stand';
      contactShadow.position.set(0, 0.008, 0.02);
      contactShadow.scale.set(1.62 * HOME_MATTHIAS_ACTOR_SCALE, 1.18 * HOME_MATTHIAS_ACTOR_SCALE, 1);
    }
    actor.updateMatrixWorld(true);
  };

  const playClip = ({ force = false } = {}) => {
    const clip = clips.get(routine.clip) || clips.get('Idle');
    if (!clip) return;
    const next = mixer.clipAction(clip);
    if (next !== action || force) {
      action?.stop();
      next.reset();
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.play();
      action = next;
    }
    // The clip time is driven by the cadence, not by the mixer clock.
    action.paused = true;
    const start = clip.duration > 0 ? (((routine.phase % clip.duration) + clip.duration) % clip.duration) : 0;
    const shape = homeMatthiasCadence(clip.name);
    // Asleep he starts already lying down, not rising from the first frame.
    const initial = shape.settle !== undefined ? Math.max(start, clip.duration * shape.shiftFrom) : start;
    cadence = { mode: 'play', time: Math.min(initial, clip.duration), speed: between(shape.speed, random), restLeft: 0 };
    action.time = still ? clip.duration * 0.34 : cadence.time;
    if (still && shape.settle !== undefined) action.time = clip.duration * shape.settle;
    mixer.update(0);
    applyPostureBones();
  };

  // Slow breathing while asleep: the blanket rises and the head sinks a hair.
  const applyBreath = () => {
    if (routine?.posture !== 'lie') return;
    const shape = homeMatthiasCadence(routine.clip);
    const period = shape.breathSeconds || 5;
    const wave = Math.sin((breathElapsed / period) * Math.PI * 2);
    if (blanket) blanket.scale.set(1, 1, 1 + 0.035 * wave);
    if (head) head.rotation.x += THREE.MathUtils.degToRad(0.8 * wave);
  };

  return {
    object: actor,
    get routine() { return routine; },
    setRoutine(next, { reducedMotion = false } = {}) {
      const changed = !routine
        || routine.propProfile !== next.propProfile
        || routine.stationId !== next.stationId
        || routine.clip !== next.clip
        || routine.phase !== next.phase
        || still !== reducedMotion;
      if (!changed) return false;
      const moved = !routine || routine.stationId !== next.stationId;
      routine = next;
      still = reducedMotion;
      gestureElapsed = 0;
      sipCycleStart = 0;
      sipCycle = between(HOME_MATTHIAS_SIP_CYCLE_SECONDS, random);
      applyPropVisibility();
      placeAtStation();
      playClip({ force: true });
      applySleepFace();
      zzzElapsed = still ? HOME_MATTHIAS_SLEEP_FACE.zzz.period * 0.45 : 0;
      placeZzz();
      actor.updateMatrixWorld(true);
      return moved;
    },
    update(deltaSeconds = 0) {
      if (!routine || still) return;
      const dt = Math.max(0, Math.min(Number(deltaSeconds) || 0, 0.1));
      gestureElapsed += dt;
      breathElapsed += dt;
      const clip = action?.getClip?.();
      if (action && clip) {
        cadence = homeMatthiasCadenceStep(cadence, { clipName: clip.name, duration: clip.duration, dt, random });
        action.time = cadence.time;
      }
      mixer.update(0);
      applyPostureBones();
      applyBreath();
      if (asleep) {
        zzzElapsed += dt;
        placeZzz();
      }
    },
    get cadence() { return cadence; },
    bounds() {
      actor.updateMatrixWorld(true);
      const box = new THREE.Box3();
      model.traverse((node) => {
        if (!node.isMesh || !node.visible) return;
        box.expandByObject(node);
      });
      if (blanket?.visible) box.expandByObject(blanket);
      return box;
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      actor.parent?.remove(actor);
      disposeObject(actor);
    },
  };
}
