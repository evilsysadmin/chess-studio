import * as THREE from 'three';

const GAUNTLET_ARTICULATION_VERSION = 'parented-finger-plates-grip-v4';
const GAUNTLET_GRIP_VERSION = 'zweihander-visible-clamp-v4';
const LEGACY_GRIP_FINGER_NAME = 'war-room-armor-gauntlet-grip-finger';
const GRIP_BAND_NAME = 'war-room-armor-gauntlet-grip-band';
const GRIP_PALM_NAME = 'war-room-armor-gauntlet-grip-palm';

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
  mesh.userData.warRoomArticulation = 'gauntlet-local-v4';
  mesh.userData.warRoomGripContact = GAUNTLET_GRIP_VERSION;
}

function gripAccentMaterial(material) {
  if (!material?.clone) return material;
  const accent = material.clone();
  accent.name = `${material.name || 'war-room-gauntlet'}-grip-accent-v4`;
  if (accent.color?.multiplyScalar) accent.color.multiplyScalar(1.42);
  if (typeof accent.roughness === 'number') accent.roughness = Math.min(accent.roughness, 0.36);
  if (typeof accent.clearcoat === 'number') accent.clearcoat = Math.max(accent.clearcoat, 0.18);
  if (typeof accent.clearcoatRoughness === 'number') accent.clearcoatRoughness = Math.min(accent.clearcoatRoughness, 0.3);
  if ('envMapIntensity' in accent) accent.envMapIntensity = Math.max(accent.envMapIntensity ?? 0, 0.82);
  accent.userData = {
    ...(accent.userData || {}),
    warRoomGauntletGripAccent: 'visible-steel-v4',
  };
  accent.needsUpdate = true;
  return accent;
}

function handleCenterLocal(gauntlet, towardBoard) {
  const scaleX = Math.max(0.001, Math.abs(gauntlet.scale.x));
  const scaleZ = Math.max(0.001, Math.abs(gauntlet.scale.z));
  return {
    x: -gauntlet.position.x / scaleX,
    z: (towardBoard * 0.44 - gauntlet.position.z) / scaleZ,
  };
}

function retireLegacyGripFingers(gauntlet) {
  const legacy = gauntlet.children.filter((child) => child.name === LEGACY_GRIP_FINGER_NAME);
  for (const finger of legacy) {
    gauntlet.remove(finger);
    finger.geometry?.dispose?.();
  }
  return legacy.length;
}

function ensureGripPalm(gauntlet, towardBoard, material) {
  let palm = gauntlet.getObjectByName?.(GRIP_PALM_NAME);
  if (!palm) {
    palm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.038, 0.078, 4, 10),
      material || gauntlet.material,
    );
    palm.name = GRIP_PALM_NAME;
    gauntlet.add(palm);
  }

  const center = handleCenterLocal(gauntlet, towardBoard);
  palm.position.set(center.x * 0.52, 0, center.z * 0.86);
  palm.rotation.set(0, 0, Math.PI / 2);
  palm.scale.set(1, 1, 0.94);
  setGripMetadata(palm);
  return palm;
}

function ensureGripThumb(gauntlet, handSide, towardBoard, material) {
  let thumb = gauntlet.getObjectByName?.('war-room-armor-gauntlet-thumb-plate');
  if (!thumb) {
    thumb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.029, 0.06, 4, 10),
      material || gauntlet.material,
    );
    thumb.name = 'war-room-armor-gauntlet-thumb-plate';
    gauntlet.add(thumb);
  }

  const center = handleCenterLocal(gauntlet, towardBoard);
  const scaleZ = Math.max(0.001, Math.abs(gauntlet.scale.z));
  thumb.position.set(
    center.x * 0.76,
    0.014 / Math.max(0.001, Math.abs(gauntlet.scale.y)),
    center.z + towardBoard * 0.032 / scaleZ,
  );
  thumb.rotation.set(towardBoard * 0.42, handSide * towardBoard * 0.16, handSide * 0.9);
  thumb.scale.set(1.08, 1, 0.96);
  setGripMetadata(thumb);
  return thumb;
}

function ensureGripBands(gauntlet, handSide, towardBoard, material) {
  const existing = gauntlet.children.filter((child) => child.name === GRIP_BAND_NAME);
  const bands = [...existing];

  while (bands.length < 3) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.056, 0.021, 8, 18, Math.PI * 1.72),
      material || gauntlet.material,
    );
    band.name = GRIP_BAND_NAME;
    gauntlet.add(band);
    bands.push(band);
  }

  const center = handleCenterLocal(gauntlet, towardBoard);
  const scaleY = Math.max(0.001, Math.abs(gauntlet.scale.y));
  bands.slice(0, 3).forEach((band, index) => {
    band.position.set(
      center.x,
      (-0.032 + index * 0.032) / scaleY,
      center.z,
    );
    band.rotation.set(
      Math.PI / 2,
      handSide * 0.18,
      handSide * (0.12 + index * 0.035),
    );
    band.userData.warRoomGripBandIndex = index;
    setGripMetadata(band);
  });

  return bands.slice(0, 3);
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
  let gripBands = 0;
  let gripPalms = 0;
  let retiredLegacyFingers = 0;

  for (const handSide of [-1, 1]) {
    const gauntlet = gauntletForSide(armor, handSide);
    if (!gauntlet) continue;
    const sidePlates = [...(platesBySide.get(handSide) || [])]
      .sort((a, b) => Math.abs(a.position.y - gauntlet.position.y) - Math.abs(b.position.y - gauntlet.position.y));
    const accent = gripAccentMaterial(sidePlates[0]?.material || gauntlet.material);
    const center = handleCenterLocal(gauntlet, towardBoard);
    const scaleX = Math.max(0.001, Math.abs(gauntlet.scale.x));
    const scaleY = Math.max(0.001, Math.abs(gauntlet.scale.y));

    retiredLegacyFingers += retireLegacyGripFingers(gauntlet);

    sidePlates.forEach((plate, finger) => {
      plate.parent?.remove?.(plate);
      gauntlet.add(plate);
      plate.material = accent || plate.material;
      plate.position.set(
        center.x * (0.7 + finger * 0.05),
        (-0.012 - finger * 0.022) / scaleY,
        center.z + towardBoard * (0.012 + finger * 0.004) / Math.max(0.001, Math.abs(gauntlet.scale.z)),
      );
      plate.rotation.set(towardBoard * 0.2, handSide * towardBoard * 0.14, handSide * (0.48 + finger * 0.07));
      plate.scale.x = Math.max(plate.scale.x, 1.16 / scaleX);
      setGripMetadata(plate);
      bound += 1;
    });

    ensureGripPalm(gauntlet, towardBoard, accent);
    gripPalms += 1;
    ensureGripThumb(gauntlet, handSide, towardBoard, accent);
    thumbPlates += 1;
    gripBands += ensureGripBands(gauntlet, handSide, towardBoard, accent).length;
    gauntlet.userData.warRoomGauntletProfile = 'articulated-zweihander-visible-clamp-v4';
    gauntlet.userData.warRoomGripContact = GAUNTLET_GRIP_VERSION;
  }

  armor.userData.warRoomGauntletArticulation = GAUNTLET_ARTICULATION_VERSION;
  armor.userData.warRoomGauntletFingerPlateCount = bound;
  armor.userData.warRoomGauntletThumbPlateCount = thumbPlates;
  armor.userData.warRoomGauntletGripBandCount = gripBands;
  armor.userData.warRoomGauntletGripPalmCount = gripPalms;
  armor.userData.warRoomGauntletRetiredLegacyGripFingerCount = retiredLegacyFingers;
  armor.userData.warRoomGauntletGrip = GAUNTLET_GRIP_VERSION;
  return bound;
}

export function bindWarRoomArmorArticulation(root, towardBoard = 1) {
  let bound = 0;
  for (const name of ['war-room-teutonic-armor-left', 'war-room-teutonic-armor-right']) {
    bound += bindArmorGauntletFingerPlates(root?.getObjectByName?.(name), towardBoard);
  }
  if (root?.userData) root.userData.warRoomArmorArticulation = 'gauntlet-zweihander-visible-clamp-v4';
  return bound;
}
