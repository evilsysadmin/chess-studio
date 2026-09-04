import * as THREE from 'three';

// User-approved Home art. This is the canonical Matthias identity for Home:
// Three.js may articulate rigid layers, but it must not redraw or procedurally
// reinterpret his face, cap, coat or emblem.
export const MATTHIAS_CANONICAL_ART_VERSION = 'angry-mock-v1';
export const MATTHIAS_CANONICAL_ASSET_URL = '/matthias-home-canonical.b64';
export const MATTHIAS_CANONICAL_ASPECT = 0.75;
export const MATTHIAS_CANONICAL_HEAD_CUT = 0.54375;
export const MATTHIAS_CANONICAL_BODY_START = 0.459375;
export const MATTHIAS_CANONICAL_RIG_VERSION = 'canonical-layer-rig-v1';

const ART_HEIGHT = 4;
const ART_WIDTH = ART_HEIGHT * MATTHIAS_CANONICAL_ASPECT;

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
  return rig;
}

export function applyMatthiasCanonicalPose(rig, pose) {
  if (!rig || !pose) return;

  // Keep amplitudes intentionally restrained: the approved art remains the
  // identity, while Three.js supplies readable life through rigid articulation.
  rig.root.position.y = (pose.bodyY || 0) * 2.2;
  rig.root.rotation.y = (pose.bodyYaw || 0) * 1.45;
  rig.root.rotation.z = Math.max(-0.018, Math.min(0.018, (pose.bodyYaw || 0) * 0.7));

  rig.headPivot.position.y = rig.base.headPivotY;
  rig.headPivot.rotation.x = Math.max(-0.11, Math.min(0.11, (pose.headPitch || 0) * 0.7));
  rig.headPivot.rotation.y = Math.max(-0.19, Math.min(0.19, (pose.headYaw || 0) * 0.72));
  rig.headPivot.rotation.z = Math.max(-0.075, Math.min(0.075, (pose.headRoll || 0) * 0.8));

  // A tiny scale breath is safe because it moves the whole approved head layer
  // uniformly; there is no local face warp and therefore no melting.
  const breath = 1 + Math.min(0.007, Math.abs(pose.bodyY || 0) * 0.08);
  rig.headPivot.scale.setScalar(breath);
}

export function disposeMatthiasCanonicalRig(rig) {
  if (!rig) return;
  rig.root?.traverse?.((node) => node.geometry?.dispose?.());
  for (const material of rig.materials || []) material?.dispose?.();
  for (const texture of rig.textures || []) texture?.dispose?.();
  rig.baseTexture?.dispose?.();
}
