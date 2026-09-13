import * as THREE from 'three';

const GAUNTLET_ARTICULATION_VERSION = 'parented-finger-plates-grip-v3';
const GAUNTLET_GRIP_VERSION = 'zweihander-wrap-v3';
const GRIP_FINGER_NAME = 'war-room-armor-gauntlet-grip-finger';

function collectNamedMeshes(root, name) {
  const matches = [];
  root?.traverse?.((object) => {
    if (object?.isMesh && object.name === name) matches.push(object);
  });
  return matches;
}

function gauntletForSide(armor, handSide) {
  return collectNamedMeshes(armor, 'war-room-armor-gauntlet')
    .find((gauntlet) => Math.sign(gauntlet.position.x) === handSide) || null;
}

function setGripMetadata(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.warRoomArticulation = 'gauntlet-local-v3';
  mesh.userData.warRoomGripContact = GAUNTLET_GRIP_VERSION;
}

function ensureGripThumb(gauntlet, handSide, towardBoard, material) {
  let thumb = gauntlet.getObjectByName?.('war-room-armor-gauntlet-thumb-plate');
  if (!thumb) {
    thumb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.024, 0.052, 4, 8),
      material || gauntlet.material,
    );
    thumb.name = 'war-room-armor-gauntlet-thumb-plate';
    gauntlet.add(thumb);
  }

  thumb.position.set(
    -handSide * 0.052 / Math.max(0.001, gauntlet.scale.x),
    0.012 / Math.max(0.001, gauntlet.scale.y),
    towardBoard * 0.064 / Math.max(0.001, gauntlet.scale.z),
  );
  thumb.rotation.set(towardBoard * 0.34, handSide * towardBoard * 0.12, handSide * 0.82);
  thumb.scale.set(1, 1, 0.9);
  setGripMetadata(thumb);
  return thumb;
}

function ensureGripFingerWraps(gauntlet, handSide, towardBoard, material) {
  const existing = gauntlet.children.filter((child) => child.name === GRIP_FINGER_NAME);
  const fingers = [...existing];

  while (fingers.length < 3) {
    const finger = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.018, 0.06, 4, 10),
      material || gauntlet.material,
    );
    finger.name = GRIP_FINGER_NAME;
    gauntlet.add(finger);
    fingers.push(finger);
  }

  fingers.slice(0, 3).forEach((finger, index) => {
    finger.position.set(
      -handSide * (0.054 + index * 0.002) / Math.max(0.001, gauntlet.scale.x),
      (0.028 - index * 0.029) / Math.max(0.001, gauntlet.scale.y),
      towardBoard * (0.052 + index * 0.004) / Math.max(0.001, gauntlet.scale.z),
    );
    finger.rotation.set(
      towardBoard * (0.08 + index * 0.025),
      handSide * towardBoard * 0.14,
      Math.PI / 2 + handSide * (index - 1) * 0.07,
    );
    finger.scale.set(1, 1, 0.88);
    finger.userData.warRoomGripFingerIndex = index;
    setGripMetadata(finger);
  });

  return fingers.slice(0, 3);
}

export function bindArmorGauntletFingerPlates(armor, towardBoard = 1) {
  if (!armor || armor.userData.warRoomGauntletArticulation === GAUNTLET_ARTICULATION_VERSION) return 0;

  const plates = collectNamedMeshes(armor, 'war-room-armor-gauntlet-finger-plate');
  const platesBySide = new Map([
    [-1, plates.filter((plate) => Math.sign(plate.position.x) === -1)],
    [1, plates.filter((plate) => Math.sign(plate.position.x) === 1)],
  ]);
  let bound = 0;
  let thumbPlates = 0;
  let gripFingers = 0;

  for (const handSide of [-1, 1]) {
    const gauntlet = gauntletForSide(armor, handSide);
    if (!gauntlet) continue;
    const sidePlates = [...(platesBySide.get(handSide) || [])]
      .sort((a, b) => Math.abs(a.position.y - gauntlet.position.y) - Math.abs(b.position.y - gauntlet.position.y));

    sidePlates.forEach((plate, finger) => {
      plate.parent?.remove?.(plate);
      gauntlet.add(plate);
      plate.position.set(
        -handSide * (0.044 + finger * 0.004) / Math.max(0.001, gauntlet.scale.x),
        (-0.016 - finger * 0.018) / Math.max(0.001, gauntlet.scale.y),
        towardBoard * (0.048 + finger * 0.006) / Math.max(0.001, gauntlet.scale.z),
      );
      plate.rotation.set(towardBoard * 0.14, handSide * towardBoard * 0.08, handSide * (0.3 + finger * 0.045));
      setGripMetadata(plate);
      bound += 1;
    });

    ensureGripThumb(gauntlet, handSide, towardBoard, sidePlates[0]?.material);
    thumbPlates += 1;
    gripFingers += ensureGripFingerWraps(gauntlet, handSide, towardBoard, sidePlates[0]?.material).length;
    gauntlet.userData.warRoomGauntletProfile = 'articulated-zweihander-wrap-v3';
    gauntlet.userData.warRoomGripContact = GAUNTLET_GRIP_VERSION;
  }

  armor.userData.warRoomGauntletArticulation = GAUNTLET_ARTICULATION_VERSION;
  armor.userData.warRoomGauntletFingerPlateCount = bound;
  armor.userData.warRoomGauntletThumbPlateCount = thumbPlates;
  armor.userData.warRoomGauntletGripFingerCount = gripFingers;
  armor.userData.warRoomGauntletGrip = GAUNTLET_GRIP_VERSION;
  return bound;
}

export function bindWarRoomArmorArticulation(root, towardBoard = 1) {
  let bound = 0;
  for (const name of ['war-room-teutonic-armor-left', 'war-room-teutonic-armor-right']) {
    bound += bindArmorGauntletFingerPlates(root?.getObjectByName?.(name), towardBoard);
  }
  if (root?.userData) root.userData.warRoomArmorArticulation = 'gauntlet-zweihander-wrap-v3';
  return bound;
}
