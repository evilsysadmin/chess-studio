import * as THREE from 'three';

// User-approved Home art. This is the canonical Matthias identity for Home:
// Three.js may articulate rigid layers, but it must not redraw or procedurally
// reinterpret his face, cap, coat or emblem.
export const MATTHIAS_CANONICAL_ART_VERSION = 'angry-mock-v1';
export const MATTHIAS_CANONICAL_ASSET_REVISION = '88bebc7e44293093';
export const MATTHIAS_CANONICAL_ASSET_URL = `/matthias-home-canonical.b64?v=${MATTHIAS_CANONICAL_ASSET_REVISION}`;
export const MATTHIAS_CANONICAL_ASPECT = 0.75;
export const MATTHIAS_CANONICAL_HEAD_CUT = 0.54375;
export const MATTHIAS_CANONICAL_BODY_START = 0.459375;
export const MATTHIAS_CANONICAL_RIG_VERSION = 'canonical-layer-rig-v1';
export const MATTHIAS_CANONICAL_MOTION_CONTRACT = 'anchored-microgestures-v1';

const ART_HEIGHT = 4;
const ART_WIDTH = ART_HEIGHT * MATTHIAS_CANONICAL_ASPECT;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function gatedMotion(value, threshold) {
  const parsed = Number(value) || 0;
  return Math.abs(parsed) <= threshold ? 0 : parsed;
}

function cropTexture(baseTexture, top, bottom) {
  const texture = baseTexture.clone();
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, bottom - top);
  texture.offset.set(0, 1 - bottom);
  texture.needsUpdate = true;
  return texture;
}

function makeLayer(baseTexture, top, bottom, z = 0) {
  const cropHeight = bottom - top;
  const texture = cropTexture(baseTexture, top, bottom);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.002,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(ART_WIDTH, ART_HEIGHT * cropHeight),
    material,
  );
  const centerFromTop = (top + bottom) / 2;
  mesh.position.set(0, ART_HEIGHT * (0.5 - centerFromTop), z);
  return { mesh, texture, material };
}

export function canonicalMatthiasDataUrl(payload) {
  const normalized = String(payload || '').trim();
  if (!normalized.startsWith('UklG')) throw new Error('Canonical Matthias WebP payload is invalid');
  return `data:image/webp;base64,${normalized}`;
}

export function createMatthiasCanonicalRig(baseTexture) {
  if (!baseTexture) throw new Error('Canonical Matthias texture is required');
  baseTexture.colorSpace = THREE.SRGBColorSpace;

  const root = new THREE.Group();
  root.name = MATTHIAS_CANONICAL_RIG_VERSION;

  // Body and head overlap around the collar on purpose. At rest both layers use
  // the same source pixels and reconstruct the approved image without a seam.
  const bodyLayer = makeLayer(baseTexture, MATTHIAS_CANONICAL_BODY_START, 1, 0);
  root.add(bodyLayer.mesh);

  const headPivot = new THREE.Group();
  headPivot.name = 'canonical-head-pivot';
  const pivotY = ART_HEIGHT * (0.5 - MATTHIAS_CANONICAL_BODY_START);
  headPivot.position.y = pivotY;
  root.add(headPivot);

  const headLayer = makeLayer(baseTexture, 0, MATTHIAS_CANONICAL_HEAD_CUT, 0.01);
  headLayer.mesh.position.y -= pivotY;
  headPivot.add(headLayer.mesh);

  const rig = {
    root,
    headPivot,
    body: bodyLayer.mesh,
    head: headLayer.mesh,
    baseTexture,
    textures: [bodyLayer.texture, headLayer.texture],
    materials: [bodyLayer.material, headLayer.material],
    base: {
      headPivotY: pivotY,
      bodyY: bodyLayer.mesh.position.y,
    },
  };
  root.userData.rigVersion = MATTHIAS_CANONICAL_RIG_VERSION;
  root.userData.artVersion = MATTHIAS_CANONICAL_ART_VERSION;
  root.userData.motionContract = MATTHIAS_CANONICAL_MOTION_CONTRACT;
  return rig;
}

export function matthiasCanonicalLayerPose(pose = {}) {
  // The canonical bitmap is a flat 2.5D card, not a real 3D head. Rotating it
  // around X/Y or scaling it reads as foreshortening/zoom, not as character
  // motion. Gate the tiny perpetual pose noise and translate/roll only around
  // the neck so meaningful FSM/activity gestures survive without the bobbing
  // “coming at the camera” effect.
  const headYaw = gatedMotion(pose.headYaw, .020);
  const headPitch = gatedMotion(pose.headPitch, .016);
  const headRoll = gatedMotion(pose.headRoll, .012);
  const bodyYaw = gatedMotion(pose.bodyYaw, .012);
  const bodyY = gatedMotion(pose.bodyY, .012);

  return {
    rootY: clamp(bodyY * .18, -.006, .006),
    rootRoll: clamp(bodyYaw * .12, -.003, .003),
    headX: clamp(headYaw * .30, -.072, .072),
    headY: clamp(-headPitch * .30, -.042, .042),
    headRoll: clamp((headRoll * .9) + (headYaw * .07), -.08, .08),
  };
}

export function applyMatthiasCanonicalPose(rig, pose) {
  if (!rig || !pose) return;

  const layerPose = matthiasCanonicalLayerPose(pose);

  // Anchor the body. No perspective wobble and, crucially, no scale pulses.
  // The approved art stays the same size while head/neck microgestures provide
  // the life. This is intentionally 2.5D until Matthias has a true rigged mesh.
  rig.root.position.set(0, layerPose.rootY, 0);
  rig.root.rotation.set(0, 0, layerPose.rootRoll);
  rig.root.scale.set(1, 1, 1);

  rig.headPivot.position.set(
    layerPose.headX,
    rig.base.headPivotY + layerPose.headY,
    0,
  );
  rig.headPivot.rotation.set(0, 0, layerPose.headRoll);
  rig.headPivot.scale.set(1, 1, 1);
}

export function disposeMatthiasCanonicalRig(rig) {
  if (!rig) return;
  rig.root?.traverse?.((node) => node.geometry?.dispose?.());
  for (const material of rig.materials || []) material?.dispose?.();
  for (const texture of rig.textures || []) texture?.dispose?.();
  rig.baseTexture?.dispose?.();
}
