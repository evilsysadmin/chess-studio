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
    : Object.freeze({ lathe: 32, sphereW: 28, sphereH: 18, torusRadial: 10, torusTubular: 40, cylinder: 32, cone: 18, curve: 12, bevel: 2 });
}

const BASE_PROFILE = [
  [0.34, 0], [0.37, 0.04], [0.37, 0.09], [0.31, 0.13], [0.29, 0.18],
  [0.23, 0.21], [0.22, 0.26], [0.18, 0.29],
];

const KNIGHT_GEOMETRY_TEMPLATES = new Map();

function markKnightTemplateGeometry(geometry, role) {
  geometry.userData.board3DKnightTemplateGeometry = true;
  geometry.userData.board3DKnightGeometryRole = role;
  return geometry;
}

function knightGeometryTemplateSet(coarsePointer = false) {
  const key = coarsePointer ? 'lite' : 'full';
  if (KNIGHT_GEOMETRY_TEMPLATES.has(key)) return KNIGHT_GEOMETRY_TEMPLATES.get(key);

  const detail = pieceDetailProfile(coarsePointer);
  const shape = new THREE.Shape();
  // v5 follows a cleaner classical knight profile. The rear line rises in a
  // controlled S-curve instead of ballooning into the shoulder/head mass that
  // made v4 read as a hunchback at tactical camera distance.
  shape.moveTo(-0.11, -0.04);
  shape.bezierCurveTo(-0.16, 0.10, -0.15, 0.24, -0.085, 0.36);
  shape.bezierCurveTo(-0.03, 0.47, 0.025, 0.56, 0.09, 0.63);
  shape.bezierCurveTo(0.15, 0.70, 0.24, 0.72, 0.31, 0.66);
  shape.bezierCurveTo(0.38, 0.60, 0.40, 0.52, 0.35, 0.46);
  shape.bezierCurveTo(0.30, 0.41, 0.24, 0.39, 0.20, 0.34);
  shape.bezierCurveTo(0.15, 0.27, 0.16, 0.16, 0.10, 0.07);
  shape.bezierCurveTo(0.04, -0.02, -0.04, -0.07, -0.11, -0.04);
  const head = new THREE.ExtrudeGeometry(shape, {
    depth: coarsePointer ? 0.22 : 0.24,
    bevelEnabled: true,
    bevelThickness: coarsePointer ? 0.035 : 0.04,
    bevelSize: coarsePointer ? 0.025 : 0.029,
    bevelSegments: detail.bevel,
    curveSegments: detail.curve,
  });
  head.center();

  const geometries = Object.freeze({
    base: markKnightTemplateGeometry(latheGeometry(BASE_PROFILE, detail.lathe), `${key}:knight-base`),
    neck: markKnightTemplateGeometry(latheGeometry([[0.19, 0.29], [0.16, 0.39], [0.12, 0.51], [0.105, 0.6]], detail.lathe), `${key}:knight-neck`),
    head: markKnightTemplateGeometry(head, `${key}:knight-head`),
    ear: markKnightTemplateGeometry(new THREE.ConeGeometry(coarsePointer ? 0.055 : 0.064, coarsePointer ? 0.16 : 0.185, detail.cone), `${key}:knight-ear`),
    eye: markKnightTemplateGeometry(
      new THREE.SphereGeometry(coarsePointer ? 0.024 : 0.028, Math.max(10, Math.floor(detail.sphereW / 2)), Math.max(7, detail.sphereH - 2)),
      `${key}:knight-eye`,
    ),
  });
  KNIGHT_GEOMETRY_TEMPLATES.set(key, geometries);
  return geometries;
}

function cloneKnightGeometry(template) {
  const geometry = template.clone();
  geometry.userData = {
    ...geometry.userData,
    board3DKnightTemplateGeometry: false,
    board3DKnightGeometryClone: true,
  };
  return geometry;
}

function knightGeometrySet(coarsePointer = false) {
  const template = knightGeometryTemplateSet(coarsePointer);
  return {
    base: cloneKnightGeometry(template.base),
    neck: cloneKnightGeometry(template.neck),
    head: cloneKnightGeometry(template.head),
    ear: cloneKnightGeometry(template.ear),
    eye: cloneKnightGeometry(template.eye),
  };
}

function addContactShadow(group, coarsePointer = false) {
  if (coarsePointer) return;
  for (const [radius, opacity, y] of [[0.31, 0.2, -0.006], [0.39, 0.075, -0.009]]) {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 28),
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
    addMesh(group, new THREE.TorusGeometry(0.115, 0.009, 7, 24), accent, [0, 0.37, 0], [Math.PI / 2, 0, 0]);
  } else if (type === 'n') {
    addMesh(group, new THREE.TorusGeometry(0.145, 0.014, 8, 30), accent, [0, 0.57, 0], [Math.PI / 2, 0, 0]);
  } else if (type === 'b') {
    addMesh(group, new THREE.TorusGeometry(0.135, 0.011, 7, 28), accent, [0, 0.7, 0], [Math.PI / 2, 0, 0]);
  } else if (type === 'r') {
    addMesh(group, new THREE.TorusGeometry(0.255, 0.012, 7, 30), accent, [0, 0.77, 0], [Math.PI / 2, 0, 0]);
  } else if (type === 'q') {
    addMesh(group, new THREE.SphereGeometry(0.052, 14, 9), accent, [0, 1.13, 0]);
  } else if (type === 'k') {
    addMesh(group, new THREE.TorusGeometry(0.155, 0.011, 7, 28), accent, [0, 0.89, 0], [Math.PI / 2, 0, 0]);
    addMesh(group, new THREE.SphereGeometry(0.032, 12, 8), accent, [0, 1.37, 0]);
  }
}

function finalizePiece(group, type) {
  let renderableMeshCount = 0;
  group?.traverse?.((child) => {
    if (!child?.isMesh || child.userData?.touchHitTarget) return;
    child.frustumCulled = false;
    child.visible = true;
    renderableMeshCount += 1;
  });
  if (group?.userData) {
    group.userData.board3DVisibilityGuard = 'fixed-board-no-frustum-v1';
    group.userData.board3DRenderableMeshCount = renderableMeshCount;
    if (type === 'n') group.userData.board3DKnightVisibilityGuard = 'isolated-geometry-v2';
  }
  return group;
}

function buildKnight(main, accent, coarsePointer = false) {
  const geometry = knightGeometrySet(coarsePointer);
  const group = new THREE.Group();
  group.userData.board3DKnightGeometryIsolation = 'per-piece-v2';
  group.userData.board3DKnightSilhouetteVersion = coarsePointer ? 'lite-v1' : 'classical-s-knight-v5';
  group.userData.board3DKnightPosture = coarsePointer ? 'lite' : 'upright-s-neck-v5';
  addMesh(group, geometry.base, main);
  addMesh(group, geometry.neck, main);

  const headMesh = addMesh(group, geometry.head, main, [0.02, coarsePointer ? 0.68 : 0.72, 0]);
  headMesh.scale.set(coarsePointer ? 1.04 : 1.10, coarsePointer ? 1.03 : 1.04, coarsePointer ? 1.04 : 1.08);
  headMesh.userData.knightHeadProfile = coarsePointer ? 'lite' : 'classical-s-neck-v5';
  addMesh(group, geometry.ear, accent, [-0.06, coarsePointer ? 0.99 : 1.045, 0.022], [0.02, 0, -0.28]);
  addMesh(group, geometry.ear, accent, [0.06, coarsePointer ? 0.99 : 1.045, 0.022], [0.02, 0, 0.28]);
  addMesh(group, geometry.eye, accent, [coarsePointer ? 0.16 : 0.185, coarsePointer ? 0.80 : 0.835, coarsePointer ? 0.125 : 0.135]);
  addMesh(group, geometry.eye, accent, [coarsePointer ? 0.16 : 0.185, coarsePointer ? 0.80 : 0.835, coarsePointer ? -0.125 : -0.135]);
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

function premiumPieceScale(type, coarsePointer) {
  if (coarsePointer) return 0.9;
  return type === 'n' ? 0.96 : 0.94;
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
      return finalizePiece(matthias, 'k');
    }

    if (type === 'n') {
      const knight = buildKnight(main, accent, coarsePointer);
      addPieceSkinDetails(knight, type, skinId, accent, coarsePointer);
      knight.scale.setScalar(premiumPieceScale(type, coarsePointer));
      knight.userData.board3DPremiumPieceScale = knight.scale.x;
      return finalizePiece(knight, type);
    }

    const group = new THREE.Group();
    addLathe(group, BASE_PROFILE, main, 0, detail.lathe);
    addMesh(group, new THREE.TorusGeometry(0.245, 0.022, detail.torusRadial, detail.torusTubular), accent, [0, 0.2, 0], [Math.PI / 2, 0, 0]);

    if (type === 'p') {
      addLathe(group, [[0.18, 0.28], [0.155, 0.36], [0.13, 0.49], [0.15, 0.55], [0.16, 0.59]], main, 0, detail.lathe);
      addMesh(group, new THREE.SphereGeometry(0.19, detail.sphereW, detail.sphereH), main, [0, 0.73, 0]);
      addMesh(group, new THREE.TorusGeometry(0.16, 0.025, detail.torusRadial, coarsePointer ? 20 : 36), accent, [0, 0.57, 0], [Math.PI / 2, 0, 0]);
    } else if (type === 'b') {
      group.userData.board3DBishopSilhouetteVersion = coarsePointer ? 'staunton-mitre-lite-v1' : 'staunton-mitre-v1';
      group.userData.board3DBishopHeightProfile = 'tall-123-v1';
      group.userData.board3DBishopSlashProfile = coarsePointer ? 'wide-diagonal-band-lite-v1' : 'wide-diagonal-band-v1';
      addLathe(group, [[0.205, 0.28], [0.19, 0.34], [0.16, 0.43], [0.125, 0.58], [0.11, 0.67], [0.15, 0.74], [0.205, 0.79]], main, 0, detail.lathe);
      addMesh(group, new THREE.TorusGeometry(0.205, 0.025, detail.torusRadial, coarsePointer ? 22 : 38), accent, [0, 0.79, 0], [Math.PI / 2, 0, 0]);
      const mitre = addLathe(group, [[0.13, 0.78], [0.17, 0.84], [0.185, 0.92], [0.17, 1.0], [0.13, 1.1], [0.075, 1.18], [0.018, 1.23]], main, 0, coarsePointer ? 18 : 34);
      mitre.userData.bishopPart = 'mitre';
      const slash = addMesh(
        group,
        new THREE.BoxGeometry(coarsePointer ? 0.055 : 0.06, coarsePointer ? 0.27 : 0.3, coarsePointer ? 0.24 : 0.27, 1, coarsePointer ? 2 : 4, 1),
        accent,
        [0.035, 1.01, 0],
        [0, 0, 0.68],
      );
      slash.userData.bishopPart = 'slash';
    } else if (type === 'r') {
      addLathe(group, [[0.22, 0.28], [0.2, 0.38], [0.19, 0.68], [0.24, 0.75], [0.28, 0.79]], main, 0, detail.lathe);
      addMesh(group, new THREE.CylinderGeometry(0.29, 0.27, 0.12, detail.cylinder), accent, [0, 0.83, 0]);
      for (let index = 0; index < 6; index += 1) {
        const angle = index * Math.PI / 3;
        addMesh(group, new THREE.BoxGeometry(0.13, 0.17, 0.13, 1, coarsePointer ? 1 : 2, 1), main, [Math.cos(angle) * 0.22, 0.95, Math.sin(angle) * 0.22], [0, -angle, 0]);
      }
    } else if (type === 'q') {
      addLathe(group, [[0.2, 0.28], [0.17, 0.4], [0.13, 0.61], [0.18, 0.75], [0.22, 0.8]], main, 0, detail.lathe);
      addMesh(group, new THREE.TorusGeometry(0.205, 0.028, detail.torusRadial, detail.torusTubular), accent, [0, 0.84, 0], [Math.PI / 2, 0, 0]);
      for (let index = 0; index < 7; index += 1) {
        const angle = index * (Math.PI * 2 / 7);
        addMesh(group, new THREE.ConeGeometry(0.055, 0.24, coarsePointer ? 10 : 16), accent, [Math.cos(angle) * 0.17, 0.96, Math.sin(angle) * 0.17]);
        addMesh(group, new THREE.SphereGeometry(0.045, coarsePointer ? 10 : 14, coarsePointer ? 7 : 9), main, [Math.cos(angle) * 0.17, 1.08, Math.sin(angle) * 0.17]);
      }
    } else if (type === 'k') {
      addLathe(group, [[0.2, 0.28], [0.17, 0.42], [0.14, 0.68], [0.19, 0.81], [0.21, 0.85]], main, 0, detail.lathe);
      addMesh(group, new THREE.TorusGeometry(0.195, 0.028, detail.torusRadial, detail.torusTubular), accent, [0, 0.86, 0], [Math.PI / 2, 0, 0]);
      addMesh(group, new THREE.SphereGeometry(0.1, coarsePointer ? 14 : 22, coarsePointer ? 10 : 16), main, [0, 0.96, 0]);
      addMesh(group, new THREE.BoxGeometry(0.07, 0.32, 0.07, 1, coarsePointer ? 2 : 4, 1), accent, [0, 1.18, 0]);
      addMesh(group, new THREE.BoxGeometry(0.25, 0.075, 0.07, coarsePointer ? 2 : 4, 1, 1), accent, [0, 1.15, 0]);
    }

    addSignatureDetail(group, type, accent, coarsePointer);
    addPieceSkinDetails(group, type, skinId, accent, coarsePointer);
    addContactShadow(group, coarsePointer);
    group.scale.setScalar(premiumPieceScale(type, coarsePointer));
    group.userData.board3DPremiumPieceScale = group.scale.x;
    return finalizePiece(group, type);
  } catch (error) {
    const fallback = buildFallbackPiece(type, main, accent);
    fallback.userData.warRoomBuildError = String(error?.message || error || 'piece build failed');
    return finalizePiece(fallback, type);
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
      if (!child.geometry.userData?.board3DSharedGeometry) child.geometry.dispose?.();
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