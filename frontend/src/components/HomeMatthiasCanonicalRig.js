import * as THREE from 'three';

// Canonical Matthias Home art generated and approved earlier in the project.
// The Three.js renderer may articulate rigid layers, but must not redraw or
// procedurally reinterpret his face, cap, coat or emblem.
export const HOME_MATTHIAS_CANONICAL_ART_VERSION = 'angry-mock-v1';
export const HOME_MATTHIAS_CANONICAL_ASSET_URL = 'matthias-home-canonical.b64';
export const HOME_MATTHIAS_CANONICAL_ASPECT = 0.75;
export const HOME_MATTHIAS_CANONICAL_HEAD_CUT = 0.54375;
export const HOME_MATTHIAS_CANONICAL_BODY_START = 0.459375;
export const HOME_MATTHIAS_CANONICAL_RIG_VERSION = 'canonical-layer-rig-v2';

const ART_HEIGHT = 4;
const ART_WIDTH = ART_HEIGHT * HOME_MATTHIAS_CANONICAL_ASPECT;

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

export function homeMatthiasCanonicalDataUrl(payload) {
  const normalized = String(payload || '').trim();
  if (!normalized.startsWith('UklG')) throw new Error('Canonical Matthias WebP payload is invalid');
  return `data:image/webp;base64,${normalized}`;
}

export function createHomeMatthiasCanonicalRig(baseTexture) {
  if (!baseTexture) throw new Error('Canonical Matthias texture is required');
  baseTexture.colorSpace = THREE.SRGBColorSpace;

  const root = new THREE.Group();
  root.name = HOME_MATTHIAS_CANONICAL_RIG_VERSION;

  // The overlap around the collar is deliberate. At rest both layers use the
  // same source pixels and reconstruct the approved image without a visible seam.
  const bodyLayer = makeLayer(baseTexture, HOME_MATTHIAS_CANONICAL_BODY_START, 1, 0);
  root.add(bodyLayer.mesh);

  const headPivot = new THREE.Group();
  headPivot.name = 'home-matthias-canonical-head-pivot';
  const pivotY = ART_HEIGHT * (0.5 - HOME_MATTHIAS_CANONICAL_BODY_START);
  headPivot.position.y = pivotY;
  root.add(headPivot);

  const headLayer = makeLayer(baseTexture, 0, HOME_MATTHIAS_CANONICAL_HEAD_CUT, 0.01);
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
    base: { headPivotY: pivotY },
  };
  root.userData.rigVersion = HOME_MATTHIAS_CANONICAL_RIG_VERSION;
  root.userData.artVersion = HOME_MATTHIAS_CANONICAL_ART_VERSION;
  return rig;
}

export function applyHomeMatthiasCanonicalPose(rig, pose = {}) {
  if (!rig) return;

  const bodyY = Number(pose.bodyY) || 0;
  const bodyYaw = Number(pose.bodyYaw) || 0;
  const bodyRoll = Number(pose.bodyRoll) || 0;
  const headPitch = Number(pose.headPitch) || 0;
  const headYaw = Number(pose.headYaw) || 0;
  const headRoll = Number(pose.headRoll) || 0;
  const breath = Number(pose.breath) || 0;

  rig.root.position.y = bodyY;
  rig.root.rotation.y = Math.max(-0.08, Math.min(0.08, bodyYaw));
  rig.root.rotation.z = Math.max(-0.022, Math.min(0.022, bodyRoll));

  rig.headPivot.position.y = rig.base.headPivotY;
  rig.headPivot.rotation.x = Math.max(-0.11, Math.min(0.11, headPitch));
  rig.headPivot.rotation.y = Math.max(-0.19, Math.min(0.19, headYaw));
  rig.headPivot.rotation.z = Math.max(-0.075, Math.min(0.075, headRoll));

  // Tiny uniform breathing is safe: the face itself is never locally warped.
  const scale = 1 + Math.max(-0.004, Math.min(0.007, breath));
  rig.headPivot.scale.setScalar(scale);
}

export function disposeHomeMatthiasCanonicalRig(rig) {
  if (!rig) return;
  const geometries = new Set();
  rig.root?.traverse?.((node) => {
    if (node.geometry && !geometries.has(node.geometry)) {
      geometries.add(node.geometry);
      node.geometry.dispose?.();
    }
  });
  for (const material of rig.materials || []) material?.dispose?.();
  for (const texture of rig.textures || []) texture?.dispose?.();
  rig.baseTexture?.dispose?.();
}
