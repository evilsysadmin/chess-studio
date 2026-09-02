import * as THREE from 'three';
import { buildMatthiasKing3D } from './MatthiasKing3D.js';
import { makePremiumPieceMaterial } from './Board3DSurfaces.js';
import { SKIN_3D } from './Board3DConfig.js';
import { addPieceSkinDetails, reinforcePieceSkinMaterial } from './Board3DSkinDecor.js';
import { COARSE_PIECE_HIT_TARGET } from './WarRoom3DTouch.js';

function makeMaterial(color, skin, accent = false, side = 'w', coarsePointer = false, skinId = 'studio') {
  return reinforcePieceSkinMaterial(
    makePremiumPieceMaterial({ color, skin, accent, side, coarsePointer }),
    color,
    skinId,
    { accent },
  );
}

function addMesh(group, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function latheGeometry(profile, segments = 36) {
  return new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), segments);
}

function addLathe(group, profile, material, y = 0, segments = 36) {
  return addMesh(group, latheGeometry(profile, segments), material, [0, y, 0]);
}

function pieceDetailProfile(coarsePointer = false) {
  return coarsePointer
    ? Object.freeze({ lathe: 18, sphereW: 16, sphereH: 10, torusRadial: 6, torusTubular: 20, cylinder: 18, cone: 12, curve: 8, bevel: 1 })
    : Object.freeze({ lathe: 36, sphereW: 32, sphereH: 22, torusRadial: 12, torusTubular: 48, cylinder: 40, cone: 22, curve: 16, bevel: 3 });
}

const BASE_PROFILE = [
  [0.34, 0], [0.37, 0.04], [0.37, 0.09], [0.31, 0.13], [0.29, 0.18],
  [0.23, 0.21], [0.22, 0.26], [0.18, 0.29],
];

function addContactShadow(group, coarsePointer = false) {
  if (coarsePointer) return;
  for (const [radius, opacity, y] of [[0.31, 0.2, -0.006], [0.39, 0.075, -0.009]]) {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 32),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = y;
    shadow.renderOrder = 1;
    shadow.castShadow = false;
    shadow.receiveShadow = false;
    shadow.userData.contactShadow = true;
    group.add(shadow);
  }
}

export function addCoarsePieceHitTarget(group, square, coarsePointer = false) {
  if (!coarsePointer || !square) return;
  const target = new THREE.Mesh(
    new THREE.CylinderGeometry(
      COARSE_PIECE_HIT_TARGET.radius,
      COARSE_PIECE_HIT_TARGET.radius,
      COARSE_PIECE_HIT_TARGET.height,
      12,
    ),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
      toneMapped: false,
    }),
  );
  target.position.y = COARSE_PIECE_HIT_TARGET.centerY;
  target.castShadow = false;
  target.receiveShadow = false;
  target.userData.square = square;
  target.userData.touchHitTarget = true;
  group.add(target);
}

function addSignatureDetail(group, type, accent, coarsePointer = false) {
  if (coarsePointer) return;
  if (type === 'p') {
    addMesh(group, new THREE.TorusGeometry(0.115, 0.009, 7, 28), accent, [0, 0.37, 0], [Math.PI / 2, 0, 0]);
  } else if (type === 'n') {
    addMesh(group, new THREE.TorusGeometry(0.14, 0.012, 8, 32), accent, [0, 0.55, 0], [Math.PI / 2, 0, 0]);
  } else if (type === 'b') {
    addMesh(group, new THREE.TorusGeometry(0.135, 0.011, 8, 32), accent, [0, 0.7, 0], [Math.PI / 2, 0, 0]);
  } else if (type === 'r') {
    addMesh(group, new THREE.TorusGeometry(0.255, 0.012, 8, 36), accent, [0, 0.77, 0], [Math.PI / 2, 0, 0]);
  } else if (type === 'q') {
    addMesh(group, new THREE.SphereGeometry(0.052, 16, 10), accent, [0, 1.13, 0]);
  } else if (type === 'k') {
    addMesh(group, new THREE.TorusGeometry(0.155, 0.011, 8, 34), accent, [0, 0.89, 0], [Math.PI / 2, 0, 0]);
    addMesh(group, new THREE.SphereGeometry(0.032, 14, 8), accent, [0, 1.37, 0]);
  }
}

function buildKnight(main, accent, coarsePointer = false) {
  const detail = pieceDetailProfile(coarsePointer);
  const group = new THREE.Group();
  addLathe(group, BASE_PROFILE, main, 0, detail.lathe);
  addLathe(group, [[0.18, 0.29], [0.16, 0.38], [0.13, 0.48], [0.14, 0.57]], main, 0, detail.lathe);

  const shape = new THREE.Shape();
  shape.moveTo(-0.13, 0);
  shape.bezierCurveTo(-0.2, 0.12, -0.2, 0.26, -0.1, 0.36);
  shape.bezierCurveTo(-0.03, 0.44, 0.03, 0.54, 0.04, 0.69);
  shape.bezierCurveTo(0.11, 0.8, 0.22, 0.84, 0.28, 0.74);
  shape.bezierCurveTo(0.22, 0.61, 0.2, 0.5, 0.17, 0.39);
  shape.bezierCurveTo(0.14, 0.29, 0.19, 0.2, 0.11, 0.1);
  shape.bezierCurveTo(0.04, 0.02, -0.04, -0.02, -0.13, 0);
  const head = new THREE.ExtrudeGeometry(shape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.025,
    bevelSegments: detail.bevel,
    curveSegments: detail.curve,
  });
  head.center();
  const headMesh = addMesh(group, head, main, [0, 0.69, 0], [0, 0, 0]);
  headMesh.scale.set(1.05, 1.05, 1.05);
  addMesh(group, new THREE.ConeGeometry(0.06, 0.17, detail.cone), accent, [-0.07, 1.02, 0.02], [0.02, 0, -0.32]);
  addMesh(group, new THREE.ConeGeometry(0.06, 0.17, detail.cone), accent, [0.07, 1.02, 0.02], [0.02, 0, 0.32]);
  addMesh(group, new THREE.SphereGeometry(0.025, Math.max(10, detail.sphereW / 2), Math.max(7, detail.sphereH - 2)), accent, [0.17, 0.82, 0.135]);
  addMesh(group, new THREE.SphereGeometry(0.025, Math.max(10, detail.sphereW / 2), Math.max(7, detail.sphereH - 2)), accent, [0.17, 0.82, -0.135]);
  addSignatureDetail(group, 'n', accent, coarsePointer);
  addContactShadow(group, coarsePointer);
  return group;
}

function buildFallbackPiece(type, main, accent) {
  const group = new THREE.Group();
  addMesh(group, new THREE.CylinderGeometry(0.31, 0.36, 0.2, 12), main, [0, 0.1, 0]);
  const heights = { p: 0.62, n: 0.78, b: 0.86, r: 0.8, q: 1.02, k: 1.06 };
  const y = heights[type] || 0.7;
  addMesh(group, new THREE.CylinderGeometry(0.15, 0.22, Math.max(0.3, y - 0.34), 12), main, [0, y * 0.48, 0]);
  addMesh(group, new THREE.SphereGeometry(type === 'p' ? 0.18 : 0.16, 12, 8), main, [0, y, 0]);
  addMesh(group, new THREE.TorusGeometry(0.2, 0.018, 6, 18), accent, [0, 0.25, 0], [Math.PI / 2, 0, 0]);
  group.scale.setScalar(0.9);
  group.userData.warRoomFallbackPiece = true;
  return group;
}

export function buildPiece(type, color, skinId, coarsePointer = false, options = {}) {
  const skin = SKIN_3D[skinId] || SKIN_3D.studio;
  const mainColor = color === 'w' ? skin.white : skin.black;
  const accentColor = color === 'w' ? skin.whiteAccent : skin.blackAccent;
  const main = makeMaterial(mainColor, skin, false, color, coarsePointer, skinId);
  const accent = makeMaterial(accentColor, skin, true, color, coarsePointer, skinId);
  const detail = pieceDetailProfile(coarsePointer);

  try {
    if (options.matthiasKing) {
      const matthias = buildMatthiasKing3D(main, accent, {
        coarsePointer,
        faceTowardCamera: options.faceTowardCamera !== false,
        pieceColor: color,
        skinId,
      });
      addPieceSkinDetails(matthias, 'k', skinId, accent, coarsePointer);
      return matthias;
    }

    if (type === 'n') {
      const knight = buildKnight(main, accent, coarsePointer);
      addPieceSkinDetails(knight, type, skinId, accent, coarsePointer);
      knight.scale.setScalar(0.9);
      return knight;
    }

    const group = new THREE.Group();
    addLathe(group, BASE_PROFILE, main, 0, detail.lathe);
    addMesh(group, new THREE.TorusGeometry(0.245, 0.022, detail.torusRadial, detail.torusTubular), accent, [0, 0.2, 0], [Math.PI / 2, 0, 0]);

    if (type === 'p') {
      addLathe(group, [[0.18, 0.28], [0.155, 0.36], [0.13, 0.49], [0.15, 0.55], [0.16, 0.59]], main, 0, detail.lathe);
      addMesh(group, new THREE.SphereGeometry(0.19, detail.sphereW, detail.sphereH), main, [0, 0.73, 0]);
      addMesh(group, new THREE.TorusGeometry(0.16, 0.025, detail.torusRadial, coarsePointer ? 20 : 44), accent, [0, 0.57, 0], [Math.PI / 2, 0, 0]);
    } else if (type === 'b') {
      addLathe(group, [[0.19, 0.28], [0.16, 0.4], [0.12, 0.58], [0.16, 0.68], [0.19, 0.73]], main, 0, detail.lathe);
      addMesh(group, new THREE.SphereGeometry(0.15, coarsePointer ? 16 : 30, coarsePointer ? 10 : 20), main, [0, 0.84, 0]);
      addMesh(group, new THREE.ConeGeometry(0.07, 0.22, detail.cone), accent, [0, 1.02, 0]);
      addMesh(group, new THREE.BoxGeometry(0.04, 0.2, 0.17, coarsePointer ? 1 : 2, coarsePointer ? 2 : 5, coarsePointer ? 1 : 2), accent, [0.035, 0.86, 0], [0, 0, 0.62]);
    } else if (type === 'r') {
      addLathe(group, [[0.22, 0.28], [0.2, 0.38], [0.19, 0.68], [0.24, 0.75], [0.28, 0.79]], main, 0, detail.lathe);
      addMesh(group, new THREE.CylinderGeometry(0.29, 0.27, 0.12, detail.cylinder), accent, [0, 0.83, 0]);
      for (let index = 0; index < 6; index += 1) {
        const angle = index * Math.PI / 3;
        addMesh(group, new THREE.BoxGeometry(0.13, 0.17, 0.13, coarsePointer ? 1 : 2, coarsePointer ? 1 : 3, coarsePointer ? 1 : 2), main, [Math.cos(angle) * 0.22, 0.95, Math.sin(angle) * 0.22], [0, -angle, 0]);
      }
    } else if (type === 'q') {
      addLathe(group, [[0.2, 0.28], [0.17, 0.4], [0.13, 0.61], [0.18, 0.75], [0.22, 0.8]], main, 0, detail.lathe);
      addMesh(group, new THREE.TorusGeometry(0.205, 0.028, detail.torusRadial, detail.torusTubular), accent, [0, 0.84, 0], [Math.PI / 2, 0, 0]);
      for (let index = 0; index < 7; index += 1) {
        const angle = index * (Math.PI * 2 / 7);
        addMesh(group, new THREE.ConeGeometry(0.055, 0.24, coarsePointer ? 10 : 18), accent, [Math.cos(angle) * 0.17, 0.96, Math.sin(angle) * 0.17]);
        addMesh(group, new THREE.SphereGeometry(0.045, coarsePointer ? 10 : 16, coarsePointer ? 7 : 10), main, [Math.cos(angle) * 0.17, 1.08, Math.sin(angle) * 0.17]);
      }
    } else if (type === 'k') {
      addLathe(group, [[0.2, 0.28], [0.17, 0.42], [0.14, 0.68], [0.19, 0.81], [0.21, 0.85]], main, 0, detail.lathe);
      addMesh(group, new THREE.TorusGeometry(0.195, 0.028, detail.torusRadial, detail.torusTubular), accent, [0, 0.86, 0], [Math.PI / 2, 0, 0]);
      addMesh(group, new THREE.SphereGeometry(0.1, coarsePointer ? 14 : 24, coarsePointer ? 10 : 18), main, [0, 0.96, 0]);
      addMesh(group, new THREE.BoxGeometry(0.07, 0.32, 0.07, coarsePointer ? 1 : 2, coarsePointer ? 2 : 5, coarsePointer ? 1 : 2), accent, [0, 1.18, 0]);
      addMesh(group, new THREE.BoxGeometry(0.25, 0.075, 0.07, coarsePointer ? 2 : 5, coarsePointer ? 1 : 2, coarsePointer ? 1 : 2), accent, [0, 1.15, 0]);
    }

    addSignatureDetail(group, type, accent, coarsePointer);
    addPieceSkinDetails(group, type, skinId, accent, coarsePointer);
    addContactShadow(group, coarsePointer);
    group.scale.setScalar(0.9);
    return group;
  } catch (error) {
    // A single geometry allocation must never leave half an army on the board.
    // Under stressed WebGL/software rendering we degrade that unit rather than
    // aborting the complete FEN rebuild and keeping only the pieces built so far.
    const fallback = buildFallbackPiece(type, main, accent);
    fallback.userData.warRoomBuildError = String(error?.message || error || 'piece build failed');
    return fallback;
  }
}

export function applyMatthiasCheckPose(state, checkSquare, orientation) {
  if (!state?.pieceMeshes) return;
  for (const [square, mesh] of state.pieceMeshes.entries()) {
    if (!mesh?.userData?.matthiasKing) continue;
    const baseScale = mesh.userData.baseScale;
    if (baseScale) mesh.scale.copy(baseScale);
    mesh.rotation.z = 0;
    mesh.position.y = mesh.userData.baseY ?? 0.1;
    if (checkSquare === square) {
      const direction = orientation === 'black' ? -1 : 1;
      mesh.rotation.z = direction * 0.055;
      mesh.position.y += 0.035;
      if (baseScale) mesh.scale.copy(baseScale).multiplyScalar(1.025);
    }
  }
}

export function disposeObject(object) {
  const disposedMaterials = new Set();
  const disposedGeometries = new Set();
  const disposedTextures = new Set();
  object?.traverse?.((child) => {
    if (child.geometry && !disposedGeometries.has(child.geometry)) {
      disposedGeometries.add(child.geometry);
      child.geometry.dispose?.();
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material || disposedMaterials.has(material)) continue;
      disposedMaterials.add(material);
      for (const value of Object.values(material)) {
        if (!value?.isTexture || disposedTextures.has(value)) continue;
        disposedTextures.add(value);
        value.dispose?.();
      }
      material.dispose?.();
    }
  });
}
