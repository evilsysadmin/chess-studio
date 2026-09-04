import * as THREE from 'three';
import { MATTHIAS_HOME_STATES } from './matthiasHomePresenceStateMachine.js';

export const MATTHIAS_PAWN_MODEL_VERSION = 'matthias-pawn-v1';
export const MATTHIAS_PAWN_FACE_RIG_VERSION = 'pawn-face-rig-v1';
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

function metalMaterial(color, { metalness = .65, roughness = .34 } = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function ceramicMaterial(color, { roughness = .42 } = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: .08, roughness });
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

function addGoldRing(parent, radius, tube, y, gold) {
  return addMesh(
    parent,
    new THREE.TorusGeometry(radius, tube, 10, 48),
    gold,
    { position: [0, y, 0], rotation: [Math.PI / 2, 0, 0] },
  );
}

function buildPawnEmblem(gold, dark) {
  const group = new THREE.Group();
  group.name = 'premium-pawn-emblem';

  addMesh(group, new THREE.CircleGeometry(.205, 36), dark, {
    position: [0, 0, -.016],
  });
  addMesh(group, new THREE.TorusGeometry(.21, .022, 8, 40), gold, {
    position: [0, 0, 0],
  });

  addMesh(group, new THREE.SphereGeometry(.06, 18, 14), gold, {
    name: 'pawn-emblem-head',
    position: [0, .075, .035],
  });
  addMesh(group, new THREE.CylinderGeometry(.047, .085, .13, 18), gold, {
    name: 'pawn-emblem-body',
    position: [0, -.02, .035],
  });
  addMesh(group, new THREE.BoxGeometry(.19, .045, .045), gold, {
    name: 'pawn-emblem-base',
    position: [0, -.115, .035],
  });
  return group;
}

function buildMouth(material) {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-.13, 0, 0),
    new THREE.Vector3(0, -.045, .012),
    new THREE.Vector3(.13, 0, 0),
  );
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 16, .012, 6, false), material);
}

export function createMatthiasPawn3D({ compact = false } = {}) {
  const root = new THREE.Group();
  root.name = MATTHIAS_PAWN_MODEL_VERSION;

  const black = metalMaterial(0x171717, { metalness: .46, roughness: .42 });
  const charcoal = metalMaterial(0x242424, { metalness: .34, roughness: .5 });
  const gold = metalMaterial(0xc69a45, { metalness: .85, roughness: .24 });
  const rust = metalMaterial(0x6e2f1e, { metalness: .35, roughness: .42 });
  const face = ceramicMaterial(0xe5c79a, { roughness: .36 });
  const ink = ceramicMaterial(0x090909, { roughness: .28 });

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  addMesh(body, new THREE.CylinderGeometry(.74, .79, .17, compact ? 24 : 40), black, {
    name: 'base', position: [0, -1.12, 0],
  });
  addGoldRing(body, .69, .028, -1.03, gold);
  addMesh(body, new THREE.CylinderGeometry(.47, .67, .87, compact ? 24 : 40), charcoal, {
    name: 'coat', position: [0, -.59, 0],
  });
  addGoldRing(body, .49, .022, -.17, gold);
  addMesh(body, new THREE.CylinderGeometry(.46, .5, .13, compact ? 24 : 40), black, {
    name: 'shoulder-ring', position: [0, -.13, 0],
  });

  addMesh(body, new THREE.BoxGeometry(.035, .62, .035), gold, {
    name: 'coat-piping-left', position: [-.39, -.58, .43], rotation: [0, 0, -.11],
  });
  addMesh(body, new THREE.BoxGeometry(.035, .62, .035), gold, {
    name: 'coat-piping-right', position: [.39, -.58, .43], rotation: [0, 0, .11],
  });
  for (const [x, y] of [[-.31, -.42], [-.31, -.64], [.31, -.42], [.31, -.64]]) {
    addMesh(body, new THREE.SphereGeometry(.035, 12, 10), gold, {
      name: 'coat-button', position: [x, y, .475],
    });
  }

  const emblem = buildPawnEmblem(gold, black);
  emblem.position.set(0, -.58, .51);
  emblem.scale.setScalar(.92);
  body.add(emblem);

  const headPivot = new THREE.Group();
  headPivot.name = 'head-pivot';
  headPivot.position.set(0, .2, 0);
  root.add(headPivot);

  addMesh(headPivot, new THREE.CylinderGeometry(.43, .47, .12, compact ? 24 : 36), face, {
    name: 'neck-ring', position: [0, -.13, 0],
  });

  const head = addMesh(headPivot, new THREE.SphereGeometry(.56, compact ? 28 : 42, compact ? 20 : 30), face, {
    name: 'pawn-face', position: [0, .37, 0], scale: [1.03, .88, .96],
  });

  const leftEye = addMesh(headPivot, new THREE.SphereGeometry(.064, 16, 12), ink, {
    name: 'eye-left', position: [-.18, .43, .52], scale: [.74, 1.28, .45],
  });
  const rightEye = addMesh(headPivot, new THREE.SphereGeometry(.064, 16, 12), ink, {
    name: 'eye-right', position: [.18, .43, .52], scale: [.74, 1.28, .45],
  });

  const leftBrow = addMesh(headPivot, new THREE.BoxGeometry(.225, .045, .045), ink, {
    name: 'brow-left', position: [-.18, .62, .53], rotation: [0, 0, -.22],
  });
  const rightBrow = addMesh(headPivot, new THREE.BoxGeometry(.225, .045, .045), ink, {
    name: 'brow-right', position: [.18, .62, .53], rotation: [0, 0, .22],
  });

  const mouthGroup = new THREE.Group();
  mouthGroup.name = 'mouth-rig';
  mouthGroup.position.set(0, .22, .545);
  const mouth = buildMouth(ink);
  mouthGroup.add(mouth);
  headPivot.add(mouthGroup);

  const speechMouth = addMesh(headPivot, new THREE.SphereGeometry(.06, 14, 10), ink, {
    name: 'speech-mouth', position: [0, .205, .54], scale: [1.25, .12, .45],
  });
  speechMouth.visible = false;

  const cap = new THREE.Group();
  cap.name = 'officer-cap';
  headPivot.add(cap);
  addMesh(cap, new THREE.CylinderGeometry(.48, .43, .15, compact ? 24 : 40), rust, {
    name: 'cap-band', position: [0, .8, .015], scale: [1.03, 1, .92],
  });
  addMesh(cap, new THREE.CylinderGeometry(.53, .49, .10, compact ? 24 : 40), black, {
    name: 'cap-crown', position: [0, .91, 0], scale: [1.04, 1, .91],
  });
  addMesh(cap, new THREE.BoxGeometry(.58, .055, .25), black, {
    name: 'cap-brim', position: [0, .72, .31], rotation: [.06, 0, 0],
  });
  addMesh(cap, new THREE.BoxGeometry(.49, .028, .025), gold, {
    name: 'cap-gold-band', position: [0, .765, .43],
  });

  const capBadge = buildPawnEmblem(gold, rust);
  capBadge.name = 'cap-pawn-emblem';
  capBadge.position.set(0, .86, .46);
  capBadge.scale.setScalar(.48);
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
  root.userData.emblem = MATTHIAS_PAWN_EMBLEM;
  return rig;
}

export function disposeMatthiasPawn3D(rig) {
  rig?.root?.traverse?.((node) => {
    node.geometry?.dispose?.();
    if (Array.isArray(node.material)) node.material.forEach((material) => material?.dispose?.());
    else node.material?.dispose?.();
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
  let headYaw = Math.sin(time * .55) * .018;
  let headPitch = breath * .012;
  let headRoll = 0;
  let bodyYaw = Math.sin(time * .31) * .006;
  let bodyY = breath * .006;
  let gazeX = 0;
  let browBias = 0;
  let smirk = 0;
  let mouthOpen = 0;
  let reach = 0;
  let energy = .11 + Math.abs(breath) * .05;

  if (presenceState === MATTHIAS_HOME_STATES.GLANCE_LEFT) {
    headYaw -= .24 * pulse;
    gazeX -= .032 * pulse;
    energy = Math.max(energy, .42 * pulse);
  } else if (presenceState === MATTHIAS_HOME_STATES.GLANCE_RIGHT) {
    headYaw += .24 * pulse;
    gazeX += .032 * pulse;
    energy = Math.max(energy, .42 * pulse);
  } else if (presenceState === MATTHIAS_HOME_STATES.SURVEY) {
    headYaw += Math.sin(stateElapsed * 4.1) * .19 * pulse;
    gazeX += Math.sin(stateElapsed * 4.6) * .022 * pulse;
    energy = Math.max(energy, .5 * pulse);
  } else if (presenceState === MATTHIAS_HOME_STATES.LEAN_IN) {
    headPitch -= .085 * pulse;
    bodyY += .018 * pulse;
    energy = Math.max(energy, .5 * pulse);
  } else if (presenceState === MATTHIAS_HOME_STATES.NOD) {
    headPitch += Math.sin(stateElapsed * 7.8) * .11 * pulse;
    energy = Math.max(energy, .52 * pulse);
  } else if (presenceState === MATTHIAS_HOME_STATES.SKEPTICAL) {
    headYaw += .08 * pulse;
    headRoll -= .07 * pulse;
    browBias = .055 * pulse;
    smirk = .72 * pulse;
    energy = Math.max(energy, .48 * pulse);
  } else if (presenceState === MATTHIAS_HOME_STATES.ATTEND) {
    headPitch -= .035;
    energy = Math.max(energy, .55);
  }

  if (profile === 'read' || profile === 'dossier') {
    headYaw += Math.sin(time * 1.38) * .065;
    gazeX += Math.sin(time * 1.8) * .014;
    headPitch += .025;
    energy = Math.max(energy, .22);
  } else if (profile === 'write') {
    headPitch += .055;
    headYaw += Math.sin(time * 2.1) * .03;
    energy = Math.max(energy, .24);
  } else if (profile === 'think') {
    headYaw += Math.sin(time * .72) * .055;
    browBias += .018;
    energy = Math.max(energy, .2);
  } else if (profile === 'sip') {
    const action = smooth01(.5 + Math.sin(time * 1.35) * .5);
    headPitch += .05 * action;
    reach = .54 * action;
    energy = Math.max(energy, .25 + .28 * action);
  } else if (profile === 'bite') {
    const action = smooth01(.5 + Math.sin(time * 1.22 + .8) * .5);
    headPitch += .065 * action;
    reach = .62 * action;
    energy = Math.max(energy, .27 + .31 * action);
  } else if (profile === 'sleep') {
    headPitch += .10 + Math.sin(time * .58) * .055;
    headRoll += Math.sin(time * .37) * .035;
    energy = Math.max(energy, .2);
  }

  if (speaking || profile === 'speak') {
    const syllable = .5 + Math.sin(time * 10.8) * .5;
    mouthOpen = .28 + syllable * .72;
    headPitch += Math.sin(time * 2.6) * .025;
    smirk = Math.max(smirk, .12);
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
  rig.leftEye.scale.y = 1.28 * eyeScaleY;
  rig.rightEye.scale.y = 1.28 * eyeScaleY;

  rig.leftBrow.position.y = base.leftBrowY + pose.browBias;
  rig.rightBrow.position.y = base.rightBrowY - pose.browBias * .35;
  rig.leftBrow.rotation.z = base.leftBrowRz - pose.smirk * .05;
  rig.rightBrow.rotation.z = base.rightBrowRz + pose.smirk * .09;

  rig.mouthGroup.position.y = base.mouthY + pose.smirk * .018;
  rig.mouthGroup.rotation.z = -pose.smirk * .12;
  rig.mouthGroup.scale.x = 1 + pose.smirk * .08;
  rig.mouthGroup.visible = pose.mouthOpen < .14;
  rig.speechMouth.visible = pose.mouthOpen >= .14;
  if (rig.speechMouth.visible) {
    rig.speechMouth.scale.y = .12 + pose.mouthOpen * .75;
    rig.speechMouth.scale.x = 1.18 + pose.mouthOpen * .18;
  }
}
