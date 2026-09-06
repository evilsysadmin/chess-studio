import * as THREE from 'three';
import { installTeutonicWarRoomDecor, registerPremiumRoomFinalization } from './WarRoomTeutonicDecor.js';
import { applyWarRoomPremiumFinishPass } from './WarRoomPremiumFinishPass.js';
import { applyWarRoomPracticalLighting } from './WarRoomPracticalLighting.js';
import { bindWarRoomArmorArticulation } from './WarRoomArmorArticulation.js';

function physical(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0,
    roughness: options.roughness ?? 0.72,
    clearcoat: options.clearcoat ?? 0.08,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.42,
    specularIntensity: options.specularIntensity ?? 0.24,
    sheen: options.sheen ?? 0,
    sheenRoughness: options.sheenRoughness ?? 0.6,
    sheenColor: new THREE.Color(options.sheenColor ?? color),
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

const PAINTING_LAYER_DEPTH = Object.freeze({
  canvas: 0.104,
  varnish: 0.112,
  outerFrame: 0.122,
  innerFrame: 0.136,
  rosette: 0.148,
});

function addPainting(group, x, y, z, towardBoard, index) {
  const frameDark = physical(0x2d1a11, { metalness: 0.03, roughness: 0.48, clearcoat: 0.34, clearcoatRoughness: 0.32, specularIntensity: 0.36 });
  const frameWarm = physical(0x5b3821, { metalness: 0.04, roughness: 0.42, clearcoat: 0.42, clearcoatRoughness: 0.25, specularIntensity: 0.42 });
  const gilding = physical(0xb78a43, { metalness: 0.78, roughness: 0.25, clearcoat: 0.44, clearcoatRoughness: 0.2, specularIntensity: 0.66 });
  const agedGold = physical(0x725126, { metalness: 0.62, roughness: 0.37, clearcoat: 0.25, specularIntensity: 0.46 });
  const linen = physical(0xffffff, {
    roughness: 0.81,
    clearcoat: 0.018,
    clearcoatRoughness: 0.9,
    specularIntensity: 0.12,
  });

  const frame = new THREE.Group();
  frame.name = `war-room-premium-painting-${index}`;
  frame.userData.warRoomPaintingFinish = 'campaign-canvas-shell-v1';
  frame.userData.warRoomPaintingLayering = 'canvas-behind-frame-v1';
  frame.userData.warRoomTransientPainterlyArtRetired = true;
  frame.position.set(x, y, z);

  addBox(frame, [2.48, 1.86, 0.08], frameDark, [0, 0, 0], 'war-room-premium-frame-back');
  addBox(frame, [2.34, 1.72, 0.042], frameWarm, [0, 0, towardBoard * 0.05], 'war-room-premium-frame-wood-bed');
  addBox(frame, [2.18, 1.56, 0.034], gilding, [0, 0, towardBoard * 0.079], 'war-room-premium-frame-gilt-bed');
  addBox(frame, [1.94, 1.32, 0.028], linen, [0, 0, towardBoard * PAINTING_LAYER_DEPTH.canvas], 'war-room-premium-painting-canvas');

  const outerBars = [
    [0, 0.86, 2.42, 0.085], [0, -0.86, 2.42, 0.085],
    [-1.19, 0, 0.085, 1.76], [1.19, 0, 0.085, 1.76],
  ];
  for (const [dx, dy, sx, sy] of outerBars) {
    addBox(
      frame,
      [sx, sy, 0.052],
      gilding,
      [dx, dy, towardBoard * PAINTING_LAYER_DEPTH.outerFrame],
      'war-room-premium-frame-outer-bar',
    );
  }

  const innerBars = [
    [0, 0.7, 2.06, 0.035], [0, -0.7, 2.06, 0.035],
    [-1.01, 0, 0.035, 1.42], [1.01, 0, 0.035, 1.42],
  ];
  for (const [dx, dy, sx, sy] of innerBars) {
    const trim = addBox(
      frame,
      [sx, sy, 0.032],
      agedGold,
      [dx, dy, towardBoard * PAINTING_LAYER_DEPTH.innerFrame],
      'war-room-premium-frame-inner-bar',
    );
    trim.castShadow = false;
  }

  for (const [cx, cy] of [[-1.13, 0.8], [1.13, 0.8], [-1.13, -0.8], [1.13, -0.8]]) {
    const rosette = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 12), agedGold);
    rosette.position.set(cx, cy, towardBoard * PAINTING_LAYER_DEPTH.rosette);
    rosette.rotation.x = Math.PI / 2;
    rosette.castShadow = false;
    frame.add(rosette);
  }

  group.add(frame);
  return frame;
}

function enforcePaintingLayering(group, towardBoard) {
  let corrected = 0;
  for (const index of [0, 1]) {
    const frame = group.getObjectByName?.(`war-room-premium-painting-${index}`);
    const canvas = frame?.getObjectByName?.('war-room-premium-painting-canvas');
    const varnish = frame?.getObjectByName?.('war-room-painting-varnish');
    if (!frame || !canvas) continue;
    canvas.position.z = towardBoard * PAINTING_LAYER_DEPTH.canvas;
    if (varnish) varnish.position.z = towardBoard * PAINTING_LAYER_DEPTH.varnish;
    frame.userData.warRoomPaintingLayering = 'canvas-behind-frame-v1';
    corrected += 1;
  }
  group.userData.warRoomPaintingLayeringVersion = 'frame-over-canvas-v1';
  group.userData.warRoomPaintingLayeringCorrected = corrected;
  return corrected;
}

export function addPremiumWarRoomPaintings(group, { wallZ, towardBoard, coarsePointer = false } = {}) {
  if (!group || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;

  installTeutonicWarRoomDecor(group, { wallZ, towardBoard, coarsePointer });
  if (coarsePointer) {
    registerPremiumRoomFinalization(group, { wallZ, towardBoard, coarsePointer });
    return 0;
  }

  const paintingZ = wallZ + towardBoard * 0.72;
  addPainting(group, -4.95, 3.65, paintingZ, towardBoard, 0);
  addPainting(group, 4.95, 3.66, paintingZ, towardBoard, 1);
  registerPremiumRoomFinalization(group, { wallZ, towardBoard, coarsePointer });
  applyWarRoomPremiumFinishPass(group, { towardBoard });
  enforcePaintingLayering(group, towardBoard);
  bindWarRoomArmorArticulation(group, towardBoard);
  applyWarRoomPracticalLighting(group, { wallZ, towardBoard, coarsePointer });
  group.userData.warRoomPremiumPaintings = 2;
  group.userData.warRoomPremiumPaintingVersion = 'v2';
  group.userData.warRoomTransientPainterlyTexturesRetired = 2;
  return 2;
}
