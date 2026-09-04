import * as THREE from 'three';
import { MATTHIAS_HOME_STATES } from './matthiasHomePresenceStateMachine.js';

export const MATTHIAS_PAWN_MODEL_VERSION = 'matthias-pawn-v2';
export const MATTHIAS_PAWN_FACE_RIG_VERSION = 'pawn-face-rig-v2';
export const MATTHIAS_PAWN_FIDELITY_VERSION = 'mock-faithful-v1';
export const MATTHIAS_PAWN_EMBLEM = 'premium-pawn';

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function statePulse(stateElapsed, durationMs) {
  if (!durationMs) return 1;
  const progress = clamp01((stateElapsed * 1000) / durationMs);
  return Math.sin(progress * Math.PI);
}

function blinkPulse(time) {
  const local = ((time + 1.15) % 4.7 + 4.7) % 4.7;
  if (local > .18) return 0;
  return Math.sin((local / .18) * Math.PI);
}

function premiumMaterial(color, {
  metalness = .55,
  roughness = .26,
  clearcoat = .45,
  clearcoatRoughness = .18,
} = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness,
    roughness,
    clearcoat,
    clearcoatRoughness,
  });
}

function ceramicMaterial(color, {
  roughness = .31,
  clearcoat = .24,
  clearcoatRoughness = .24,
} = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: .02,
    roughness,
    clearcoat,
    clearcoatRoughness,
  });
}

function addMesh(parent, geometry, material, {
  name = '',
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
} = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function addGoldRing(parent, radius, tube, y, gold, zScale = 1) {
  const ring = addMesh(
    parent,
    new THREE.TorusGeometry(radius, tube, 10, 56),
    gold,
    { position: [0, y, 0], rotation: [Math.PI / 2, 0, 0] },
  );
  ring.scale.z = zScale;
  return ring;
}

function addTube(parent, points, radius, material, name) {
  const curve = new THREE.CatmullRomCurve3(points);
  return addMesh(
    parent,
    new THREE.TubeGeometry(curve, 24, radius, 7, false),
    material,
    { name },
  );
}

function buildPawnEmblem(gold, dark, { laurel = true } = {}) {
  const group = new THREE.Group();
  group.name = 'premium-pawn-emblem';

  addMesh(group, new THREE.CircleGeometry(.205, 48), dark, {
    name: 'pawn-emblem-field',
    position: [0, 0, -.012],
  });
  addMesh(group, new THREE.TorusGeometry(.215, .018, 10, 48), gold, {
    name: 'pawn-emblem-ring',
  });

  if (laurel) {
    addMesh(group, new THREE.TorusGeometry(.265, .011, 7, 30, Math.PI * .67), gold, {
      name: 'pawn-emblem-laurel-left',
      position: [0, -.015, .008],
      rotation: [0, 0, Math.PI * .67],
    });
    addMesh(group, new THREE.TorusGeometry(.265, .011, 7, 30, Math.PI * .67), gold, {
      name: 'pawn-emblem-laurel-right',
      position: [0, -.015, .008],
      rotation: [0, 0, -Math.PI * .34],
    });
  }

  addMesh(group, new THREE.SphereGeometry(.06, 20, 15), gold, {
    name: 'pawn-emblem-head',
    position: [0, .075, .035],
  });
  addMesh(group, new THREE.CylinderGeometry(.047, .082, .13, 20), gold, {
    name: 'pawn-emblem-body',
    position: [0, -.02, .035],
  });
  addMesh(group, new THREE.CylinderGeometry(.095, .105, .035, 20), gold, {
    name: 'pawn-emblem-collar',
    position: [0, -.095, .035],
  });
  addMesh(group, new THREE.BoxGeometry(.19, .04, .04), gold, {
    name: 'pawn-emblem-base',
    position: [0, -.132, .035],
  });
  return group;
}

function buildFrown(material) {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-.145, 0, 0),
    new THREE.Vector3(0, .066, .012),
    new THREE.Vector3(.145, 0, 0),
  );
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 20, .012, 7, false), material);
}

function buildCapVisor(material, compact) {
  const shape = new THREE.Shape();
  shape.moveTo(-.50, -.08);
  shape.bezierCurveTo(-.62, -.02, -.68, .12, -.61, .24);
  shape.bezierCurveTo(-.40, .37, .40, .37, .61, .24);
  shape.bezierCurveTo(.68, .12, .62, -.02, .50, -.08);
  shape.bezierCurveTo(.31, .01, -.31, .01, -.50, -.08);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: .055,
    curveSegments: compact ? 5 : 9,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: compact ? 1 : 2,
    bevelSize: .012,
    bevelThickness: .012,
  });
  geometry.center();
  return new THREE.Mesh(geometry, material);
}

function bodyProfile() {
  return [
    new THREE.Vector2(.79, -1.19),
    new THREE.Vector2(.81, -1.13),
    new THREE.Vector2(.78, -1.05),
    new THREE.Vector2(.70, -.99),
    new THREE.Vector2(.66, -.93),
    new THREE.Vector2(.62, -.87),
    new THREE.Vector2(.56, -.82),
    new THREE.Vector2(.51, -.73),
    new THREE.Vector2(.46, -.57),
    new THREE.Vector2(.43, -.25),
    new THREE.Vector2(.45, -.15),
    new THREE.Vector2(.51, -.10),
    new THREE.Vector2(.51, -.035),
    new THREE.Vector2(.45, .025),
  ];
}

function buildEye(parent, ink, shine, name, x) {
  const eye = addMesh(parent, new THREE.SphereGeometry(.072, 20, 16), ink, {
    name,
    position: [x, .42, .553],
    scale: [.70, 1.30, .38],
  });
  addMesh(eye, new THREE.SphereGeometry(.017, 10, 8), shine, {
    name: `${name}-glint`,
    position: [-.018, .025, .063],
    scale: [1.1, 1.1, .65],
  });
  return eye;
}

export function createMatthiasPawn3D({ compact = false } = {}) {
  const root = new THREE.Group();
  root.name = MATTHIAS_PAWN_MODEL_VERSION;

  const segments = compact ? 28 : 56;
  const black = premiumMaterial(0x07080a, {
    metalness: .58,
    roughness: .20,
    clearcoat: .72,
    clearcoatRoughness: .12,
  });
  const charcoal = premiumMaterial(0x15171b, {
    metalness: .48,
    roughness: .29,
    clearcoat: .45,
    clearcoatRoughness: .18,
  });
  const panelDark = premiumMaterial(0x0c0d10, {
    metalness: .42,
    roughness: .34,
    clearcoat: .36,
  });
  const gold = premiumMaterial(0xd8a13a, {
    metalness: 1,
    roughness: .15,
    clearcoat: .32,
    clearcoatRoughness: .10,
  });
  const rust = premiumMaterial(0x6e2117, {
    metalness: .27,
    roughness: .30,
    clearcoat: .40,
  });
  const face = ceramicMaterial(0xe2bf89, {
    roughness: .29,
    clearcoat: .22,
  });
  const ink = premiumMaterial(0x030405, {
    metalness: .18,
    roughness: .16,
    clearcoat: .70,
    clearcoatRoughness: .12,
  });
  const eyeShine = ceramicMaterial(0xfff8e9, { roughness: .18, clearcoat: .55 });

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  addMesh(body, new THREE.LatheGeometry(bodyProfile(), segments), charcoal, {
    name: 'premium-coat-body',
  });
  addMesh(body, new THREE.CylinderGeometry(.76, .79, .10, segments), black, {
    name: 'base-plinth', position: [0, -1.18, 0],
  });
  addMesh(body, new THREE.CylinderGeometry(.70, .76, .10, segments), black, {
    name: 'base-upper-step', position: [0, -1.06, 0],
  });

  addGoldRing(body, .735, .022, -1.115, gold);
  addGoldRing(body, .655, .020, -.985, gold);
  addGoldRing(body, .548, .017, -.835, gold);
  addGoldRing(body, .468, .016, -.135, gold);
  addGoldRing(body, .485, .014, -.045, gold);

  const chestPanelShape = new THREE.Shape();
  chestPanelShape.moveTo(-.34, .28);
  chestPanelShape.lineTo(.34, .28);
  chestPanelShape.lineTo(.43, -.34);
  chestPanelShape.lineTo(.31, -.52);
  chestPanelShape.lineTo(-.31, -.52);
  chestPanelShape.lineTo(-.43, -.34);
  chestPanelShape.closePath();
  addMesh(body, new THREE.ShapeGeometry(chestPanelShape), panelDark, {
    name: 'uniform-front-panel',
    position: [0, -.47, .468],
    scale: [1.02, 1.02, 1],
  });

  addTube(body, [
    new THREE.Vector3(-.36, -.18, .475),
    new THREE.Vector3(-.40, -.46, .505),
    new THREE.Vector3(-.49, -.73, .455),
    new THREE.Vector3(-.57, -.84, .35),
  ], .014, gold, 'coat-piping-left');
  addTube(body, [
    new THREE.Vector3(.36, -.18, .475),
    new THREE.Vector3(.40, -.46, .505),
    new THREE.Vector3(.49, -.73, .455),
    new THREE.Vector3(.57, -.84, .35),
  ], .014, gold, 'coat-piping-right');

  for (const [x, y, z] of [
    [-.37, -.39, .49], [-.40, -.62, .475],
    [.37, -.39, .49], [.40, -.62, .475],
  ]) {
    addMesh(body, new THREE.SphereGeometry(.032, 14, 10), gold, {
      name: 'coat-button', position: [x, y, z],
    });
  }

  const emblem = buildPawnEmblem(gold, panelDark, { laurel: true });
  emblem.position.set(0, -.53, .515);
  emblem.scale.setScalar(.88);
  body.add(emblem);

  const headPivot = new THREE.Group();
  headPivot.name = 'head-pivot';
  headPivot.position.set(0, .11, 0);
  root.add(headPivot);

  addMesh(headPivot, new THREE.CylinderGeometry(.445, .475, .105, segments), face, {
    name: 'neck-ring', position: [0, -.105, 0],
  });
  addGoldRing(headPivot, .455, .016, -.055, gold);

  const head = addMesh(
    headPivot,
    new THREE.SphereGeometry(.585, compact ? 34 : 58, compact ? 24 : 40),
    face,
    {
      name: 'pawn-face',
      position: [0, .405, 0],
      scale: [1.01, .94, .97],
    },
  );

  const leftEye = buildEye(headPivot, ink, eyeShine, 'eye-left', -.185);
  const rightEye = buildEye(headPivot, ink, eyeShine, 'eye-right', .185);

  const browGeometry = new THREE.CapsuleGeometry(.025, .17, compact ? 3 : 5, compact ? 8 : 12);
  const leftBrow = addMesh(headPivot, browGeometry, ink, {
    name: 'brow-left',
    position: [-.185, .605, .565],
    rotation: [0, 0, Math.PI / 2 - .34],
  });
  const rightBrow = addMesh(headPivot, browGeometry.clone(), ink, {
    name: 'brow-right',
    position: [.185, .605, .565],
    rotation: [0, 0, Math.PI / 2 + .34],
  });

  const mouthGroup = new THREE.Group();
  mouthGroup.name = 'mouth-rig';
  mouthGroup.position.set(0, .205, .575);
  const mouth = buildFrown(ink);
  mouth.name = 'angry-frown';
  mouthGroup.add(mouth);
  headPivot.add(mouthGroup);

  const speechMouth = addMesh(headPivot, new THREE.SphereGeometry(.065, 16, 12), ink, {
    name: 'speech-mouth',
    position: [0, .19, .57],
    scale: [1.35, .12, .43],
  });
  speechMouth.visible = false;

  const cap = new THREE.Group();
  cap.name = 'officer-cap';
  cap.rotation.x = -.025;
  headPivot.add(cap);

  addMesh(cap, new THREE.CylinderGeometry(.61, .585, .145, segments), rust, {
    name: 'cap-red-band',
    position: [0, .84, .005],
    scale: [1, 1, .84],
  });
  addMesh(cap, new THREE.CylinderGeometry(.69, .605, .17, segments), black, {
    name: 'cap-crown',
    position: [0, .965, -.015],
    scale: [1, 1, .83],
  });
  addMesh(cap, new THREE.CylinderGeometry(.705, .685, .055, segments), black, {
    name: 'cap-top',
    position: [0, 1.075, -.02],
    scale: [1, 1, .82],
  });

  const topPiping = addGoldRing(cap, .675, .011, 1.052, gold, .82);
  topPiping.name = 'cap-top-piping';
  const bandPiping = addGoldRing(cap, .595, .012, .815, gold, .84);
  bandPiping.name = 'cap-band-piping';

  const visor = buildCapVisor(black, compact);
  visor.name = 'cap-curved-visor';
  visor.position.set(0, .745, .315);
  visor.rotation.x = Math.PI / 2 - .075;
  visor.scale.set(1.03, 1, .96);
  cap.add(visor);

  const visorTrim = addTube(cap, [
    new THREE.Vector3(-.50, .775, .47),
    new THREE.Vector3(-.27, .745, .54),
    new THREE.Vector3(0, .735, .565),
    new THREE.Vector3(.27, .745, .54),
    new THREE.Vector3(.50, .775, .47),
  ], .011, gold, 'cap-visor-gold-trim');
  visorTrim.scale.z = .98;

  addTube(cap, [
    new THREE.Vector3(-.49, .81, .475),
    new THREE.Vector3(0, .77, .555),
    new THREE.Vector3(.49, .81, .475),
  ], .012, gold, 'cap-braided-cord');

  for (const x of [-.535, .535]) {
    addMesh(cap, new THREE.SphereGeometry(.035, 14, 10), gold, {
      name: 'cap-side-button', position: [x, .82, .37],
    });
  }

  const capBadge = buildPawnEmblem(gold, panelDark, { laurel: true });
  capBadge.name = 'cap-pawn-emblem';
  capBadge.position.set(0, .91, .535);
  capBadge.scale.setScalar(.43);
  cap.add(capBadge);

  const rig = {
    root,
    body,
    headPivot,
    head,
    leftEye,
    rightEye,
    leftBrow,
    rightBrow,
    mouthGroup,
    speechMouth,
    emblem,
    cap,
    base: {
      headY: headPivot.position.y,
      leftEyeX: leftEye.position.x,
      rightEyeX: rightEye.position.x,
      leftBrowY: leftBrow.position.y,
      rightBrowY: rightBrow.position.y,
      leftBrowRz: leftBrow.rotation.z,
      rightBrowRz: rightBrow.rotation.z,
      mouthY: mouthGroup.position.y,
    },
  };

  root.userData.rig = rig;
  root.userData.modelVersion = MATTHIAS_PAWN_MODEL_VERSION;
  root.userData.faceRigVersion = MATTHIAS_PAWN_FACE_RIG_VERSION;
  root.userData.fidelityVersion = MATTHIAS_PAWN_FIDELITY_VERSION;
  root.userData.emblem = MATTHIAS_PAWN_EMBLEM;
  return rig;
}

export function disposeMatthiasPawn3D(rig) {
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  rig?.root?.traverse?.((node) => {
    if (node.geometry && !disposedGeometries.has(node.geometry)) {
      disposedGeometries.add(node.geometry);
      node.geometry.dispose?.();
    }
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (material && !disposedMaterials.has(material)) {
        disposedMaterials.add(material);
        material.dispose?.();
      }
    }
  });
}

export function matthiasPawnPoseSample({
  profile = 'idle',
  presenceState = MATTHIAS_HOME_STATES.IDLE,
  time = 0,
  stateElapsed = 0,
  stateDurationMs = 0,
  speaking = false,
  motionIntensity = 1,
} = {}) {
  const intensity = Math.max(.7, Math.min(1.35, Number(motionIntensity) || 1));
  const breath = Math.sin(time * 1.15);
  const pulse = statePulse(stateElapsed, stateDurationMs);
  const attendingUser = speaking || profile === 'speak' || presenceState === MATTHIAS_HOME_STATES.ATTEND;
  const busyWithTask = !attendingUser && ['read', 'dossier', 'write', 'think', 'sip', 'bite'].includes(profile);

  // Matthias lives here. He is not a receptionist waiting square-on for the
  // player. Outside deliberate attention/speech he keeps a mild room-facing
  // bias, then turns further toward whatever task currently occupies him.
  let headYaw = attendingUser ? Math.sin(time * .55) * .008 : .085 + Math.sin(time * .55) * .020;
  let headPitch = breath * .012;
  let headRoll = 0;
  let bodyYaw = attendingUser ? Math.sin(time * .31) * .004 : .032 + Math.sin(time * .31) * .008;
  let bodyY = breath * .006;
  let gazeX = attendingUser ? 0 : .006;
  let browBias = 0;
  let smirk = 0;
  let mouthOpen = 0;
  let reach = 0;
  let energy = .11 + Math.abs(breath) * .05;

  if (!attendingUser && presenceState === MATTHIAS_HOME_STATES.GLANCE_LEFT) {
    headYaw -= (busyWithTask ? .055 : .24) * pulse;
    gazeX -= (busyWithTask ? .014 : .032) * pulse;
    energy = Math.max(energy, .42 * pulse);
  } else if (!attendingUser && presenceState === MATTHIAS_HOME_STATES.GLANCE_RIGHT) {
    headYaw += (busyWithTask ? .055 : .24) * pulse;
    gazeX += (busyWithTask ? .014 : .032) * pulse;
    energy = Math.max(energy, .42 * pulse);
  } else if (!attendingUser && presenceState === MATTHIAS_HOME_STATES.SURVEY) {
    headYaw += Math.sin(stateElapsed * 4.1) * (busyWithTask ? .060 : .19) * pulse;
    gazeX += Math.sin(stateElapsed * 4.6) * (busyWithTask ? .010 : .022) * pulse;
    energy = Math.max(energy, .5 * pulse);
  } else if (!attendingUser && presenceState === MATTHIAS_HOME_STATES.LEAN_IN) {
    headPitch -= .085 * pulse;
    bodyY += .018 * pulse;
    energy = Math.max(energy, .5 * pulse);
  } else if (!attendingUser && presenceState === MATTHIAS_HOME_STATES.NOD) {
    headPitch += Math.sin(stateElapsed * 7.8) * .11 * pulse;
    energy = Math.max(energy, .52 * pulse);
  } else if (!attendingUser && presenceState === MATTHIAS_HOME_STATES.SKEPTICAL) {
    headYaw += .08 * pulse;
    headRoll -= .07 * pulse;
    browBias = .045 * pulse;
    smirk = .48 * pulse;
    energy = Math.max(energy, .48 * pulse);
  } else if (presenceState === MATTHIAS_HOME_STATES.ATTEND) {
    headPitch -= .035;
    energy = Math.max(energy, .55);
  }

  if (!attendingUser && (profile === 'read' || profile === 'dossier')) {
    headYaw += .16 + Math.sin(time * 1.38) * .028;
    bodyYaw += .055;
    gazeX += .016 + Math.sin(time * 1.8) * .006;
    headPitch += .035;
    energy = Math.max(energy, .22);
  } else if (!attendingUser && profile === 'write') {
    headPitch += .060;
    headYaw += .19 + Math.sin(time * 2.1) * .020;
    bodyYaw += .070;
    gazeX += .018;
    energy = Math.max(energy, .24);
  } else if (!attendingUser && profile === 'think') {
    headYaw += .12 + Math.sin(time * .72) * .035;
    bodyYaw += .040;
    gazeX += .012;
    browBias += .018;
    energy = Math.max(energy, .2);
  } else if (!attendingUser && profile === 'sip') {
    const action = smooth01(.5 + Math.sin(time * 1.35) * .5);
    headYaw += .135;
    bodyYaw += .045;
    gazeX += .012;
    headPitch += .05 * action;
    reach = .54 * action;
    energy = Math.max(energy, .25 + .28 * action);
  } else if (!attendingUser && profile === 'bite') {
    const action = smooth01(.5 + Math.sin(time * 1.22 + .8) * .5);
    headYaw += .145;
    bodyYaw += .050;
    gazeX += .012;
    headPitch += .065 * action;
    reach = .62 * action;
    energy = Math.max(energy, .27 + .31 * action);
  } else if (!attendingUser && profile === 'sleep') {
    headYaw += .10;
    bodyYaw += .025;
    headPitch += .10 + Math.sin(time * .58) * .055;
    headRoll += Math.sin(time * .37) * .035;
    energy = Math.max(energy, .2);
  }

  if (speaking || profile === 'speak') {
    const syllable = .5 + Math.sin(time * 10.8) * .5;
    mouthOpen = .28 + syllable * .72;
    headPitch += Math.sin(time * 2.6) * .025;
    smirk = Math.max(smirk, .08);
    energy = Math.max(energy, .62);
  }

  const blink = blinkPulse(time);
  const articulate = Math.max(
    Math.abs(headYaw),
    Math.abs(headPitch),
    Math.abs(headRoll),
    Math.abs(gazeX) * 4,
    blink * .16,
    mouthOpen * .12,
  );

  return {
    headYaw: headYaw * intensity,
    headPitch: headPitch * intensity,
    headRoll: headRoll * intensity,
    bodyYaw: bodyYaw * intensity,
    bodyY: bodyY * intensity,
    gazeX: gazeX * intensity,
    browBias: browBias * intensity,
    smirk: clamp01(smirk * intensity),
    mouthOpen: clamp01(mouthOpen * intensity),
    blink: clamp01(blink),
    reach: clamp01(reach * intensity),
    energy: Math.max(energy, articulate) * intensity,
    articulation: articulate * intensity,
  };
}

export function applyMatthiasPawnPose(rig, pose) {
  if (!rig || !pose) return;
  const { base } = rig;
  rig.root.position.y = pose.bodyY;
  rig.root.rotation.y = pose.bodyYaw;
  rig.headPivot.rotation.set(pose.headPitch, pose.headYaw, pose.headRoll);
  rig.headPivot.position.y = base.headY;

  rig.leftEye.position.x = base.leftEyeX + pose.gazeX;
  rig.rightEye.position.x = base.rightEyeX + pose.gazeX;
  const eyeScaleY = Math.max(.08, 1 - pose.blink * .92);
  rig.leftEye.scale.y = 1.30 * eyeScaleY;
  rig.rightEye.scale.y = 1.30 * eyeScaleY;

  rig.leftBrow.position.y = base.leftBrowY + pose.browBias;
  rig.rightBrow.position.y = base.rightBrowY - pose.browBias * .35;
  rig.leftBrow.rotation.z = base.leftBrowRz - pose.smirk * .035;
  rig.rightBrow.rotation.z = base.rightBrowRz + pose.smirk * .06;

  // The canonical Home face remains angry. Skeptical/smirk states only skew the
  // frown slightly; they never flip it into the friendly smile that made the
  // first procedural model look like a toy mascot.
  rig.mouthGroup.position.y = base.mouthY + pose.smirk * .012;
  rig.mouthGroup.rotation.z = -pose.smirk * .08;
  rig.mouthGroup.scale.x = 1 + pose.smirk * .05;
  rig.mouthGroup.visible = pose.mouthOpen < .14;
  rig.speechMouth.visible = pose.mouthOpen >= .14;
  if (rig.speechMouth.visible) {
    rig.speechMouth.scale.y = .12 + pose.mouthOpen * .72;
    rig.speechMouth.scale.x = 1.24 + pose.mouthOpen * .16;
  }
}
