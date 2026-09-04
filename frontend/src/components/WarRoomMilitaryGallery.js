import * as THREE from 'three';
import { createWarRoomCampaignTexture } from './WarRoomCampaignArt.js';
import { registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';

const GALLERY = Object.freeze({
  darkWood: 0x25150f,
  warmWood: 0x53331f,
  agedGold: 0x8d672d,
  brass: 0xb8893d,
  iron: 0x1b1917,
  ember: 0xff7a1a,
  flame: 0xffb24d,
  flameCore: 0xffdf88,
});

function physical(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.04,
    roughness: options.roughness ?? 0.62,
    clearcoat: options.clearcoat ?? 0.16,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.36,
    specularIntensity: options.specularIntensity ?? 0.34,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.opacity != null && options.opacity < 1,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
    map: options.map ?? null,
  });
}

function addMesh(group, geometry, material, position, rotation = [0, 0, 0], name = '') {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

function addBox(group, size, material, position, name = '') {
  return addMesh(group, new THREE.BoxGeometry(...size), material, position, [0, 0, 0], name);
}

function replaceCentralCanvas(frame, artKey, title) {
  const canvas = frame?.getObjectByName?.('war-room-premium-painting-canvas');
  if (!canvas?.material) return false;

  const previous = canvas.material.map;
  if (previous?.userData?.warRoomCampaignArt === artKey) return true;
  previous?.dispose?.();

  // Swap only the artwork. The premium finish pass already gave this canvas
  // woven linen, bump, varnish and museum-grade material response; replacing
  // those values here would make the new art look flatter than the old one.
  canvas.material.map = createWarRoomCampaignTexture(artKey);
  canvas.material.color.setHex(0xffffff);
  canvas.material.needsUpdate = true;
  canvas.userData.warRoomCampaignArt = artKey;
  canvas.userData.warRoomCampaignTitle = title;

  frame.userData.warRoomGalleryRole = 'central-campaign-canvas';
  frame.userData.warRoomCampaignGalleryVersion = 'approved-mock-v1';
  frame.userData.warRoomCampaignArt = artKey;
  frame.userData.warRoomCampaignTitle = title;
  delete frame.userData.warRoomLandscapeVersion;
  delete frame.userData.warRoomLandscapeSubject;
  delete frame.userData.warRoomGalleryLandscapeVersion;
  return true;
}

function applyCentralCampaignArt(root) {
  let changed = 0;
  changed += replaceCentralCanvas(
    root?.getObjectByName?.('war-room-premium-painting-0'),
    'command',
    'Matthias al mando',
  ) ? 1 : 0;
  changed += replaceCentralCanvas(
    root?.getObjectByName?.('war-room-premium-painting-1'),
    'victory',
    'Matthias en la victoria',
  ) ? 1 : 0;
  return changed;
}

function registerCampaignArtFinalizer(group) {
  return registerWarRoomDeferredFinalizer(group, {
    key: 'military-gallery-art-v1',
    run: (root) => {
      const changed = applyCentralCampaignArt(root || group);
      const owner = (root || group)?.getObjectByName?.('war-room-castle-architecture') || group;
      if (owner?.userData) owner.userData.warRoomMilitaryGalleryFinalized = 'approved-mock-v1';
      return changed;
    },
  });
}

function addSidePainting(group, {
  side,
  wallZ,
  towardBoard,
  artKey,
  title,
  offset,
}) {
  const frame = new THREE.Group();
  frame.name = side < 0 ? 'war-room-campaign-painting-left' : 'war-room-campaign-painting-right';
  frame.userData.warRoomGalleryRole = 'side-campaign-canvas';
  frame.userData.warRoomCampaignGalleryVersion = 'approved-mock-v1';
  frame.userData.warRoomCampaignArt = artKey;
  frame.userData.warRoomCampaignTitle = title;

  const dark = physical(GALLERY.darkWood, {
    roughness: 0.48,
    clearcoat: 0.34,
    specularIntensity: 0.38,
  });
  const wood = physical(GALLERY.warmWood, {
    roughness: 0.44,
    clearcoat: 0.4,
    specularIntensity: 0.42,
  });
  const gold = physical(GALLERY.agedGold, {
    metalness: 0.68,
    roughness: 0.32,
    clearcoat: 0.24,
    specularIntensity: 0.54,
  });
  const canvasMat = physical(0xffffff, {
    roughness: 0.72,
    clearcoat: 0.08,
    clearcoatRoughness: 0.68,
    specularIntensity: 0.18,
    map: createWarRoomCampaignTexture(artKey),
  });

  addBox(frame, [1.68, 2.2, 0.08], dark, [0, 0, 0], 'war-room-campaign-frame-back');
  addBox(frame, [1.56, 2.08, 0.04], wood, [0, 0, 0.048], 'war-room-campaign-frame-bed');
  addBox(frame, [1.36, 1.86, 0.028], canvasMat, [0, 0, 0.086], 'war-room-campaign-side-canvas');

  for (const [x, y, w, h] of [
    [0, 1.02, 1.6, 0.07], [0, -1.02, 1.6, 0.07],
    [-0.76, 0, 0.07, 2.08], [0.76, 0, 0.07, 2.08],
  ]) {
    const trim = addBox(frame, [w, h, 0.045], gold, [x, y, 0.105], 'war-room-campaign-frame-gilt');
    trim.castShadow = false;
  }

  frame.position.set(side * 7.66, 3.28, wallZ + towardBoard * offset);
  frame.rotation.y = -side * Math.PI / 2;
  frame.userData.warRoomOffsetFromWall = offset;
  frame.userData.facesWarTable = true;
  group.add(frame);
  return frame;
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function attachTorchKinetics(outer, inner, light, phase) {
  const outerBase = outer.scale.clone();
  const innerBase = inner.scale.clone();
  const baseIntensity = light.intensity;
  outer.userData.warRoomAnimatedTorch = true;
  light.userData.baseWarRoomIntensity = baseIntensity;

  outer.onBeforeRender = () => {
    const now = nowMs();
    const slow = Math.sin(now * 0.0061 + phase);
    const fast = Math.sin(now * 0.0197 + phase * 1.71);
    const lick = Math.sin(now * 0.031 + phase * 0.63);
    const flutter = slow * 0.07 + fast * 0.045 + lick * 0.025;

    outer.rotation.z = slow * 0.07 + fast * 0.025;
    inner.rotation.z = -slow * 0.045 + lick * 0.018;
    outer.scale.set(
      outerBase.x * (1 - fast * 0.06),
      outerBase.y * (1 + slow * 0.13 + lick * 0.045),
      outerBase.z * (1 - slow * 0.035),
    );
    inner.scale.set(
      innerBase.x * (1 + fast * 0.035),
      innerBase.y * (1 + lick * 0.1),
      innerBase.z,
    );
    light.intensity = baseIntensity * (1 + flutter);
  };
}

function addSideTorch(group, { side, wallZ, towardBoard, offset, phase }) {
  const torch = new THREE.Group();
  torch.name = side < 0 ? 'war-room-side-torch-left' : 'war-room-side-torch-right';
  torch.userData.warRoomPracticalDecor = 'animated-castle-torch';

  const brass = physical(GALLERY.brass, {
    metalness: 0.82,
    roughness: 0.25,
    clearcoat: 0.34,
    specularIntensity: 0.62,
  });
  const iron = physical(GALLERY.iron, {
    metalness: 0.58,
    roughness: 0.52,
    clearcoat: 0.08,
  });
  const outerMat = physical(GALLERY.flame, {
    roughness: 0.18,
    clearcoat: 0,
    emissive: GALLERY.ember,
    emissiveIntensity: 2.35,
  });
  const innerMat = physical(GALLERY.flameCore, {
    roughness: 0.16,
    clearcoat: 0,
    emissive: 0xffb020,
    emissiveIntensity: 2.7,
  });

  addBox(torch, [0.32, 0.48, 0.07], iron, [0, 0, 0], 'war-room-side-torch-backplate');
  addMesh(torch, new THREE.TorusGeometry(0.15, 0.022, 8, 20, Math.PI), brass, [0, -0.04, 0.17], [Math.PI / 2, 0, 0], 'war-room-side-torch-bracket');
  addMesh(torch, new THREE.CylinderGeometry(0.13, 0.09, 0.28, 18), brass, [0, 0.04, 0.25], [0, 0, 0], 'war-room-side-torch-cup');

  const outer = addMesh(
    torch,
    new THREE.ConeGeometry(0.115, 0.38, 16),
    outerMat,
    [0, 0.36, 0.26],
    [0, 0, 0],
    'war-room-side-torch-flame-outer',
  );
  const inner = addMesh(
    torch,
    new THREE.ConeGeometry(0.062, 0.24, 14),
    innerMat,
    [0.01, 0.33, 0.285],
    [0, 0, 0],
    'war-room-side-torch-flame-inner',
  );
  outer.castShadow = false;
  inner.castShadow = false;

  const light = new THREE.PointLight(0xffa44c, 1.35, 5.8, 2);
  light.name = 'war-room-side-torch-light';
  light.position.set(0, 0.34, 0.64);
  light.castShadow = false;
  torch.add(light);
  attachTorchKinetics(outer, inner, light, phase);

  torch.position.set(side * 7.61, 4.25, wallZ + towardBoard * offset);
  torch.rotation.y = -side * Math.PI / 2;
  torch.userData.warRoomOffsetFromWall = offset;
  group.add(torch);
  return torch;
}

export function installWarRoomMilitaryGallery(group, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!group || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard) || coarsePointer) return 0;
  if (group.userData.warRoomMilitaryGalleryVersion === 'approved-mock-v1') {
    registerCampaignArtFinalizer(group);
    return 0;
  }

  const centralReplaced = applyCentralCampaignArt(group);

  addSidePainting(group, {
    side: -1,
    wallZ,
    towardBoard,
    artKey: 'cavalry',
    title: 'Carga de caballería de Matthias',
    offset: 3.95,
  });
  addSidePainting(group, {
    side: 1,
    wallZ,
    towardBoard,
    artKey: 'laurel',
    title: 'Gloria perfectamente modesta de Matthias',
    offset: 3.95,
  });
  addSideTorch(group, { side: -1, wallZ, towardBoard, offset: 5.35, phase: 0.7 });
  addSideTorch(group, { side: 1, wallZ, towardBoard, offset: 5.35, phase: 3.1 });

  group.userData.warRoomMilitaryGalleryVersion = 'approved-mock-v1';
  group.userData.warRoomMilitaryGalleryCentralCanvases = centralReplaced;
  group.userData.warRoomMilitaryGallerySideCanvases = 2;
  group.userData.warRoomMilitaryGalleryTorches = 2;
  registerCampaignArtFinalizer(group);
  return centralReplaced + 4;
}
