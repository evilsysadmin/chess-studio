import * as THREE from 'three';

const GAUNTLET_ARTICULATION_VERSION = 'parented-finger-plates-grip-v2';
const GAUNTLET_GRIP_VERSION = 'zweihander-contact-v2';

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

function ensureGripThumb(gauntlet, handSide, towardBoard, material) {
  const existing = gauntlet.getObjectByName?.('war-room-armor-gauntlet-thumb-plate');
  if (existing) return 0;

  const thumb = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.024, 0.045, 4, 8),
    material || gauntlet.material,
  );
  thumb.name = 'war-room-armor-gauntlet-thumb-plate';
  thumb.position.set(
    -handSide * 0.055 / Math.max(0.001, gauntlet.scale.x),
    0.006 / Math.max(0.001, gauntlet.scale.y),
    towardBoard * 0.055 / Math.max(0.001, gauntlet.scale.z),
  );
  thumb.rotation.set(towardBoard * 0.22, 0, handSide * 0.72);
  thumb.scale.z = 0.86;
  thumb.castShadow = true;
  thumb.receiveShadow = true;
  thumb.userData.warRoomArticulation = 'gauntlet-local-v2';
  thumb.userData.warRoomGripContact = GAUNTLET_GRIP_VERSION;
  gauntlet.add(thumb);
  return 1;
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

  for (const handSide of [-1, 1]) {
    const gauntlet = gauntletForSide(armor, handSide);
    if (!gauntlet) continue;
    const sidePlates = [...(platesBySide.get(handSide) || [])]
      .sort((a, b) => Math.abs(a.position.y - gauntlet.position.y) - Math.abs(b.position.y - gauntlet.position.y));

    sidePlates.forEach((plate, finger) => {
      plate.parent?.remove?.(plate);
      gauntlet.add(plate);
      plate.position.set(
        -handSide * (0.035 + finger * 0.006) / Math.max(0.001, gauntlet.scale.x),
        (-0.02 - finger * 0.017) / Math.max(0.001, gauntlet.scale.y),
        towardBoard * (0.052 + finger * 0.006) / Math.max(0.001, gauntlet.scale.z),
      );
      plate.rotation.set(towardBoard * 0.1, 0, handSide * (0.2 + finger * 0.035));
      plate.userData.warRoomArticulation = 'gauntlet-local-v2';
      plate.userData.warRoomGripContact = GAUNTLET_GRIP_VERSION;
      bound += 1;
    });

    thumbPlates += ensureGripThumb(gauntlet, handSide, towardBoard, sidePlates[0]?.material);
    gauntlet.userData.warRoomGauntletProfile = 'articulated-zweihander-grip-v2';
    gauntlet.userData.warRoomGripContact = GAUNTLET_GRIP_VERSION;
  }

  armor.userData.warRoomGauntletArticulation = GAUNTLET_ARTICULATION_VERSION;
  armor.userData.warRoomGauntletFingerPlateCount = bound;
  armor.userData.warRoomGauntletThumbPlateCount = thumbPlates;
  armor.userData.warRoomGauntletGrip = GAUNTLET_GRIP_VERSION;
  return bound;
}

export function bindWarRoomArmorArticulation(root, towardBoard = 1) {
  let bound = 0;
  for (const name of ['war-room-teutonic-armor-left', 'war-room-teutonic-armor-right']) {
    bound += bindArmorGauntletFingerPlates(root?.getObjectByName?.(name), towardBoard);
  }
  if (root?.userData) root.userData.warRoomArmorArticulation = 'gauntlet-zweihander-grip-v2';
  return bound;
}
