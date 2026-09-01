import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import Board from './Board.jsx';
import { buildPremiumTableLayer, buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
import { buildMatthiasKing3D, isMatthiasRivalKing } from './MatthiasKing3D.js';
import {
  getCameraFramingProfile,
  installPremiumEnvironment,
  makePremiumPieceMaterial,
  makePremiumTileMaterial,
} from './Board3DSurfaces.js';
import { loadBoardTheme } from '../career.js';
import { loadSelectedSkin } from '../tournamentRewards.js';
import { USER_PREFERENCES_CHANGED_EVENT, getEffectiveReducedMotion } from '../userPreferences.js';
import { adaptiveRenderScale, clamp01, deriveMoveKinetics, easeOutCubic, inferCapturedPiece, reactiveLightProfile, smoothstep } from './WarRoom3DMotion.js';
import { COARSE_PIECE_HIT_TARGET, resolveBoardTap } from './WarRoom3DTouch.js';
import { warRoomDecorProfile } from './WarRoom3DMobileVisuals.js';
import './Board3D.css';
import './Board3DViewportTuning.css';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const DISPLAY_RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const BOARD_THEME_3D = Object.freeze({
  classic: { light: 0xd9cfba, dark: 0x5a4236, frame: 0x34251f, felt: 0x111722, glow: 0xc9a227 },
  midnight: { light: 0xaab2bd, dark: 0x263244, frame: 0x111824, felt: 0x080d16, glow: 0x6f9fc5 },
  blood: { light: 0xc9b5a6, dark: 0x5d2926, frame: 0x2b1515, felt: 0x12090a, glow: 0xb4483a },
  royal: { light: 0xd8c990, dark: 0x493564, frame: 0x221b32, felt: 0x0d0b15, glow: 0xe0b84e },
  forensic: { light: 0xc6d2ce, dark: 0x40515a, frame: 0x1c262b, felt: 0x0a1013, glow: 0x63c0ba },
  obsidian: { light: 0xb5b0a8, dark: 0x202225, frame: 0x0c0d0f, felt: 0x050607, glow: 0xc7a34a },
});

const SKIN_3D = Object.freeze({
  default: {
    white: 0xe7d7ad, black: 0x2b2d31, whiteAccent: 0xb68a38, blackAccent: 0x9b342f,
    metalness: 0.18, roughness: 0.62, emissive: 0x000000, emissiveIntensity: 0,
  },
  studio: {
    white: 0xf0eadc, black: 0x262a30, whiteAccent: 0xc7a34a, blackAccent: 0x8f312e,
    metalness: 0.26, roughness: 0.48, emissive: 0x000000, emissiveIntensity: 0,
  },
  regimiento: {
    white: 0xf2e1bd, black: 0x313238, whiteAccent: 0xc79b43, blackAccent: 0xa62e2a,
    metalness: 0.44, roughness: 0.38, emissive: 0x000000, emissiveIntensity: 0,
  },
  azul: {
    white: 0xd8e2e8, black: 0x1f3344, whiteAccent: 0x6f9fc5, blackAccent: 0x366c94,
    metalness: 0.32, roughness: 0.44, emissive: 0x000000, emissiveIntensity: 0,
  },
  shogunate: {
    white: 0xe9e0cf, black: 0x162236, whiteAccent: 0xc33d45, blackAccent: 0x305ea8,
    metalness: 0.5, roughness: 0.32, emissive: 0x142f70, emissiveIntensity: 0.12,
  },
  esmeralda: {
    white: 0xd9dcc9, black: 0x23372e, whiteAccent: 0x759b68, blackAccent: 0x36634d,
    metalness: 0.28, roughness: 0.5, emissive: 0x000000, emissiveIntensity: 0,
  },
  cyber: {
    white: 0xcbd6df, black: 0x151b23, whiteAccent: 0x53b7d8, blackAccent: 0x7f3dcc,
    metalness: 0.72, roughness: 0.24, emissive: 0x297ea7, emissiveIntensity: 0.18,
  },
  marines: {
    white: 0xc9c5ad, black: 0x2d352f, whiteAccent: 0x9f8b52, blackAccent: 0x526b4e,
    metalness: 0.34, roughness: 0.64, emissive: 0x000000, emissiveIntensity: 0,
  },
  delta: {
    white: 0xbfc2c3, black: 0x151718, whiteAccent: 0x922c2a, blackAccent: 0x721f20,
    metalness: 0.5, roughness: 0.34, emissive: 0x641414, emissiveIntensity: 0.12,
  },
});

function parseFen(fen) {
  const rows = String(fen || '').trim().split(/\s+/)[0]?.split('/') || [];
  if (rows.length !== 8) return [];
  const pieces = [];
  rows.forEach((row, rankIndex) => {
    let fileIndex = 0;
    for (const char of row) {
      if (/^[1-8]$/.test(char)) {
        fileIndex += Number(char);
      } else if (/^[prnbqkPRNBQK]$/.test(char) && fileIndex < 8) {
        pieces.push({
          square: `${FILES[fileIndex]}${8 - rankIndex}`,
          type: char.toLowerCase(),
          color: char === char.toUpperCase() ? 'w' : 'b',
        });
        fileIndex += 1;
      }
    }
  });
  return pieces;
}

function squarePosition(square) {
  const file = FILES.indexOf(square?.[0]);
  const rank = Number(square?.[1]);
  return { x: file - 3.5, z: 4.5 - rank };
}

function adjacentSquare(square, key, orientation) {
  const fileIndex = FILES.indexOf(square?.[0]);
  const rankIndex = DISPLAY_RANKS.indexOf(square?.[1]);
  if (fileIndex < 0 || rankIndex < 0) return null;
  let df = 0;
  let dr = 0;
  if (key === 'ArrowRight') df = 1;
  else if (key === 'ArrowLeft') df = -1;
  else if (key === 'ArrowUp') dr = -1;
  else if (key === 'ArrowDown') dr = 1;
  else return null;
  if (orientation === 'black') { df *= -1; dr *= -1; }
  const nextFile = fileIndex + df;
  const nextRank = rankIndex + dr;
  if (nextFile < 0 || nextFile > 7 || nextRank < 0 || nextRank > 7) return null;
  return `${FILES[nextFile]}${DISPLAY_RANKS[nextRank]}`;
}

function applyMatthiasCheckPose(state, checkSquare, orientation) {
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

function makeMaterial(color, skin, accent = false, side = 'w', coarsePointer = false) {
  return makePremiumPieceMaterial({ color, skin, accent, side, coarsePointer });
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

function addLathe(group, profile, material, y = 0) {
  return addMesh(group, latheGeometry(profile), material, [0, y, 0]);
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

function addCoarsePieceHitTarget(group, square, coarsePointer = false) {
  if (!coarsePointer || !square) return;
  const target = new THREE.Mesh(
    new THREE.CylinderGeometry(
      COARSE_PIECE_HIT_TARGET.radius,
      COARSE_PIECE_HIT_TARGET.radius,
      COARSE_PIECE_HIT_TARGET.height,
      16,
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
  const group = new THREE.Group();
  addLathe(group, BASE_PROFILE, main);
  addLathe(group, [[0.18, 0.29], [0.16, 0.38], [0.13, 0.48], [0.14, 0.57]], main);

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
    bevelSegments: 3,
    curveSegments: 16,
  });
  head.center();
  const headMesh = addMesh(group, head, main, [0, 0.69, 0], [0, 0, 0]);
  headMesh.scale.set(1.05, 1.05, 1.05);
  addMesh(group, new THREE.ConeGeometry(0.06, 0.17, 18), accent, [-0.07, 1.02, 0.02], [0.02, 0, -0.32]);
  addMesh(group, new THREE.ConeGeometry(0.06, 0.17, 18), accent, [0.07, 1.02, 0.02], [0.02, 0, 0.32]);
  addMesh(group, new THREE.SphereGeometry(0.025, 16, 10), accent, [0.17, 0.82, 0.135]);
  addMesh(group, new THREE.SphereGeometry(0.025, 16, 10), accent, [0.17, 0.82, -0.135]);
  addSignatureDetail(group, 'n', accent, coarsePointer);
  addContactShadow(group, coarsePointer);
  return group;
}

function buildPiece(type, color, skinId, coarsePointer = false, options = {}) {
  const skin = SKIN_3D[skinId] || SKIN_3D.studio;
  const main = makeMaterial(color === 'w' ? skin.white : skin.black, skin, false, color, coarsePointer);
  const accent = makeMaterial(color === 'w' ? skin.whiteAccent : skin.blackAccent, skin, true, color, coarsePointer);

  if (options.matthiasKing) {
    return buildMatthiasKing3D(main, accent, {
      coarsePointer,
      faceTowardCamera: options.faceTowardCamera !== false,
    });
  }

  if (type === 'n') {
    const knight = buildKnight(main, accent, coarsePointer);
    knight.scale.setScalar(0.9);
    return knight;
  }

  const group = new THREE.Group();
  addLathe(group, BASE_PROFILE, main);
  addMesh(group, new THREE.TorusGeometry(0.245, 0.022, 12, 48), accent, [0, 0.2, 0], [Math.PI / 2, 0, 0]);

  if (type === 'p') {
    addLathe(group, [[0.18, 0.28], [0.155, 0.36], [0.13, 0.49], [0.15, 0.55], [0.16, 0.59]], main);
    addMesh(group, new THREE.SphereGeometry(0.19, 32, 22), main, [0, 0.73, 0]);
    addMesh(group, new THREE.TorusGeometry(0.16, 0.025, 12, 44), accent, [0, 0.57, 0], [Math.PI / 2, 0, 0]);
  } else if (type === 'b') {
    addLathe(group, [[0.19, 0.28], [0.16, 0.4], [0.12, 0.58], [0.16, 0.68], [0.19, 0.73]], main);
    addMesh(group, new THREE.SphereGeometry(0.15, 30, 20), main, [0, 0.84, 0]);
    addMesh(group, new THREE.ConeGeometry(0.07, 0.22, 22), accent, [0, 1.02, 0]);
    addMesh(group, new THREE.BoxGeometry(0.04, 0.2, 0.17, 2, 5, 2), accent, [0.035, 0.86, 0], [0, 0, 0.62]);
  } else if (type === 'r') {
    addLathe(group, [[0.22, 0.28], [0.2, 0.38], [0.19, 0.68], [0.24, 0.75], [0.28, 0.79]], main);
    addMesh(group, new THREE.CylinderGeometry(0.29, 0.27, 0.12, 40), accent, [0, 0.83, 0]);
    for (let index = 0; index < 6; index += 1) {
      const angle = index * Math.PI / 3;
      addMesh(group, new THREE.BoxGeometry(0.13, 0.17, 0.13, 2, 3, 2), main, [Math.cos(angle) * 0.22, 0.95, Math.sin(angle) * 0.22], [0, -angle, 0]);
    }
  } else if (type === 'q') {
    addLathe(group, [[0.2, 0.28], [0.17, 0.4], [0.13, 0.61], [0.18, 0.75], [0.22, 0.8]], main);
    addMesh(group, new THREE.TorusGeometry(0.205, 0.028, 12, 48), accent, [0, 0.84, 0], [Math.PI / 2, 0, 0]);
    for (let index = 0; index < 7; index += 1) {
      const angle = index * (Math.PI * 2 / 7);
      addMesh(group, new THREE.ConeGeometry(0.055, 0.24, 18), accent, [Math.cos(angle) * 0.17, 0.96, Math.sin(angle) * 0.17]);
      addMesh(group, new THREE.SphereGeometry(0.045, 16, 10), main, [Math.cos(angle) * 0.17, 1.08, Math.sin(angle) * 0.17]);
    }
  } else if (type === 'k') {
    addLathe(group, [[0.2, 0.28], [0.17, 0.42], [0.14, 0.68], [0.19, 0.81], [0.21, 0.85]], main);
    addMesh(group, new THREE.TorusGeometry(0.195, 0.028, 12, 48), accent, [0, 0.86, 0], [Math.PI / 2, 0, 0]);
    addMesh(group, new THREE.SphereGeometry(0.1, 24, 18), main, [0, 0.96, 0]);
    addMesh(group, new THREE.BoxGeometry(0.07, 0.32, 0.07, 2, 5, 2), accent, [0, 1.18, 0]);
    addMesh(group, new THREE.BoxGeometry(0.25, 0.075, 0.07, 5, 2, 2), accent, [0, 1.15, 0]);
  }

  addSignatureDetail(group, type, accent, coarsePointer);
  addContactShadow(group, coarsePointer);
  group.scale.setScalar(0.9);
  return group;
}

function disposeObject(object) {
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

function makeTextSprite(text, color = '#e7dcc0') {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '700 34px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.34, 0.17, 1);
  sprite.userData.ownedTexture = texture;
  return sprite;
}

function addBox(group, size, color, position, options = {}) {
  const material = new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.08,
    roughness: options.roughness ?? 0.68,
    clearcoat: options.clearcoat ?? 0.18,
    clearcoatRoughness: 0.25,
    transparent: options.opacity != null && options.opacity < 1,
    opacity: options.opacity ?? 1,
  });
  const mesh = addMesh(group, new THREE.BoxGeometry(...size), material, position, options.rotation || [0, 0, 0]);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

function buildTrophy(group, x, y, z, goldMaterial) {
  addMesh(group, new THREE.CylinderGeometry(0.12, 0.17, 0.08, 24), goldMaterial, [x, y, z]);
  addMesh(group, new THREE.CylinderGeometry(0.05, 0.07, 0.22, 20), goldMaterial, [x, y + 0.14, z]);
  addMesh(group, new THREE.SphereGeometry(0.13, 20, 14), goldMaterial, [x, y + 0.3, z]);
  const handle = new THREE.TorusGeometry(0.15, 0.025, 8, 24, Math.PI * 1.35);
  addMesh(group, handle, goldMaterial, [x - 0.12, y + 0.3, z], [Math.PI / 2, 0, Math.PI * 0.2]);
  addMesh(group, handle.clone(), goldMaterial, [x + 0.12, y + 0.3, z], [Math.PI / 2, Math.PI, -Math.PI * 0.2]);
}

function buildWarRoom(theme, whiteSide, coarsePointer = false) {
  const room = new THREE.Group();
  const far = whiteSide ? -1 : 1;
  const wallZ = far * 7.6;
  const towardBoard = -far;
  const wood = 0x2a160d;
  const woodDark = 0x130b07;
  const brass = 0xb88a35;
  const decor = warRoomDecorProfile(coarsePointer);

  addBox(room, [19, 0.38, 18], 0x100b08, [0, -0.55, 0], { roughness: 0.82, metalness: 0.02 });
  addBox(room, [15.6, 6.3, 0.35], woodDark, [0, 2.42, wallZ], { roughness: 0.82 });
  addBox(room, [15.3, 0.28, 0.55], wood, [0, 0.12, wallZ + towardBoard * 0.12]);
  addBox(room, [15.3, 0.25, 0.62], wood, [0, 2.0, wallZ + towardBoard * 0.12]);
  addBox(room, [15.3, 0.25, 0.62], wood, [0, 4.9, wallZ + towardBoard * 0.12]);

  for (const x of [-6.4, -4.7, -3, 3, 4.7, 6.4]) {
    addBox(room, [0.16, 4.7, 0.5], wood, [x, 2.55, wallZ + towardBoard * 0.16], { roughness: 0.75 });
  }

  const windowX = whiteSide ? 4.2 : -4.2;
  addBox(room, [4.3, 3.1, 0.16], 0x0a2334, [windowX, 3.3, wallZ + towardBoard * 0.27], { emissive: 0x0c3551, roughness: 0.42 });
  addBox(room, [4.55, 0.15, 0.35], wood, [windowX, 1.72, wallZ + towardBoard * 0.34]);
  addBox(room, [4.55, 0.15, 0.35], wood, [windowX, 4.88, wallZ + towardBoard * 0.34]);
  addBox(room, [0.15, 3.3, 0.35], wood, [windowX - 2.23, 3.3, wallZ + towardBoard * 0.34]);
  addBox(room, [0.15, 3.3, 0.35], wood, [windowX + 2.23, 3.3, wallZ + towardBoard * 0.34]);
  addBox(room, [0.11, 3.05, 0.28], 0x1f2f3a, [windowX, 3.3, wallZ + towardBoard * 0.38]);
  addBox(room, [4.3, 0.1, 0.28], 0x1f2f3a, [windowX, 3.3, wallZ + towardBoard * 0.38]);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xb9d9f0 }),
  );
  moon.position.set(windowX + 1.15, 4.05, wallZ + towardBoard * 0.43);
  room.add(moon);

  for (const [offset, height] of [[-1.1, 1.2], [-0.6, 1.65], [0, 1.4], [0.55, 2.0], [1.05, 1.45]]) {
    const tower = addBox(room, [0.4, height, 0.24], 0x09131b, [windowX + offset, 1.72 + height / 2, wallZ + towardBoard * 0.46], { roughness: 1, castShadow: false });
    tower.castShadow = false;
  }

  const bannerX = whiteSide ? -0.6 : 0.6;
  addBox(room, [2.25, 3.25, 0.12], decor.banner, [bannerX, 3.25, wallZ + towardBoard * 0.31], { roughness: 0.88 });
  addBox(room, [2.34, 0.09, 0.18], brass, [bannerX, 4.9, wallZ + towardBoard * 0.38], { metalness: 0.8, roughness: 0.24 });
  // El blasón premium es el único peón ceremonial de la pared.

  const gold = new THREE.MeshPhysicalMaterial({ color: brass, metalness: 0.82, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.1, envMapIntensity: 1.18 });
  const shelfZ = wallZ + towardBoard * 0.55;
  buildTrophy(room, bannerX - 2.35, 2.18, shelfZ, gold);
  buildTrophy(room, bannerX + 2.25, 2.18, shelfZ, gold);

  const globeX = whiteSide ? -4.2 : 4.2;
  addMesh(room, new THREE.SphereGeometry(0.52, 28, 18), new THREE.MeshPhysicalMaterial({ color: 0x283640, metalness: 0.25, roughness: 0.45, clearcoat: 0.45, envMapIntensity: 0.82 }), [globeX, 2.78, shelfZ]);
  addMesh(room, new THREE.TorusGeometry(0.61, 0.035, 10, 36), gold, [globeX, 2.78, shelfZ], [Math.PI / 2.2, 0, 0.35]);
  addMesh(room, new THREE.CylinderGeometry(0.05, 0.09, 0.55, 18), gold, [globeX, 2.25, shelfZ]);

  const candleMaterial = new THREE.MeshStandardMaterial({ color: 0xe7d1a4, roughness: 0.8 });
  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffbd57 });
  for (const x of [bannerX - 3.15, bannerX + 3.15]) {
    addMesh(room, new THREE.CylinderGeometry(0.07, 0.09, 0.52, 18), candleMaterial, [x, 2.18, shelfZ]);
    addMesh(room, new THREE.SphereGeometry(0.055, 12, 8), flameMaterial, [x, 2.5, shelfZ]);
    const candleLight = new THREE.PointLight(0xffa94d, 3.2, 5, 2);
    candleLight.position.set(x, 2.55, shelfZ + towardBoard * 0.25);
    room.add(candleLight);
  }

  const ambientPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(17, 7),
    new THREE.MeshBasicMaterial({ color: theme.felt, transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
  );
  ambientPanel.position.set(0, 2.4, wallZ + far * 0.25);
  if (whiteSide) ambientPanel.rotation.y = Math.PI;
  room.add(ambientPanel);

  return room;
}

function fitBoardCamera(camera, width, height, whiteSide) {
  const aspect = Math.max(0.35, width / Math.max(1, height));
  const profile = getCameraFramingProfile(aspect);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const distance = THREE.MathUtils.clamp(
    (profile.halfSpan / Math.tan(limitingFov / 2)) * profile.padding,
    profile.minDistance,
    profile.maxDistance,
  );
  const target = new THREE.Vector3(0, profile.targetY, whiteSide ? -profile.targetZ : profile.targetZ);
  const direction = new THREE.Vector3(0, profile.cameraY, whiteSide ? profile.cameraZ : -profile.cameraZ).normalize();
  camera.aspect = aspect;
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.lookAt(target);
  camera.userData.basePosition = camera.position.clone();
  camera.userData.baseTarget = target.clone();
  camera.updateProjectionMatrix();
}

function Board3DCanvas({
  fen,
  onSquareClick,
  selectedSquare,
  legalTargets = [],
  lastMove,
  orientation = 'white',
  animate,
  hintMove,
  checkSquare,
  gameOver = false,
  showCoordinates = true,
  matthiasKingColor = null,
  onCustomize,
  onRendererFailure,
}) {
  const hostRef = useRef(null);
  const sceneStateRef = useRef(null);
  const pointerStartRef = useRef(null);
  const latestPropsRef = useRef({});
  const animationFrameRef = useRef(0);
  const ambientFrameRef = useRef(0);
  const previousFenRef = useRef(fen);
  const lastAnimatedSeqRef = useRef(0);
  const inspectModeRef = useRef(false);
  const cameraMotionRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, yaw: 0, pitch: 0, dragging: false, lastX: 0, lastY: 0 });
  const [skinId, setSkinId] = useState(() => loadSelectedSkin());
  const [boardTheme, setBoardTheme] = useState(() => loadBoardTheme());
  const [rendererLabel, setRendererLabel] = useState('3D');
  const [focusedSquare, setFocusedSquare] = useState(() => orientation === 'black' ? 'e8' : 'e1');
  const [hoveredSquare, setHoveredSquare] = useState(null);
  const [inspectMode, setInspectMode] = useState(false);

  latestPropsRef.current = { onSquareClick, onRendererFailure };

  useEffect(() => {
    const refreshSkin = (event) => setSkinId(event?.detail || loadSelectedSkin());
    const refreshPreferences = () => setBoardTheme(loadBoardTheme());
    window.addEventListener('chess-piece-skin-change', refreshSkin);
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshPreferences);
    return () => {
      window.removeEventListener('chess-piece-skin-change', refreshSkin);
      window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshPreferences);
    };
  }, []);

  useEffect(() => {
    setFocusedSquare(orientation === 'black' ? 'e8' : 'e1');
    setHoveredSquare(null);
  }, [orientation]);

  useEffect(() => {
    inspectModeRef.current = inspectMode;
    if (!inspectMode) {
      const motion = cameraMotionRef.current;
      motion.x = 0;
      motion.y = 0;
      motion.targetX = 0;
      motion.targetY = 0;
      motion.yaw = 0;
      motion.pitch = 0;
      motion.dragging = false;
      const state = sceneStateRef.current;
      const basePosition = state?.camera?.userData?.basePosition;
      const baseTarget = state?.camera?.userData?.baseTarget;
      if (state && basePosition && baseTarget) {
        state.camera.position.copy(basePosition);
        state.camera.lookAt(baseTarget);
        state.render();
      }
    }
  }, [inspectMode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (error) {
      latestPropsRef.current.onRendererFailure?.(error);
      return undefined;
    }

    const coarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const squareMeshes = new Map();
    const highlightMeshes = new Map();
    const pieceMeshes = new Map();
    const pieceGroup = new THREE.Group();
    const coordinateGroup = new THREE.Group();
    const boardGroup = new THREE.Group();
    const theme = BOARD_THEME_3D[boardTheme] || BOARD_THEME_3D.classic;
    const whiteSide = orientation !== 'black';

    scene.background = new THREE.Color(0x080a0f);
    scene.fog = new THREE.FogExp2(0x080a0f, 0.018);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.25 : 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = coarsePointer ? 1.02 : 1.05;
    renderer.domElement.className = 'board3d-main-canvas';
    renderer.domElement.setAttribute('aria-label', 'Tablero de ajedrez 3D en Sala de guerra. Cámara táctica fija desde tu lado. Usa flechas y Enter para jugar con teclado.');
    renderer.domElement.setAttribute('role', 'application');
    renderer.domElement.tabIndex = 0;
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);

    const releaseEnvironment = installPremiumEnvironment(renderer, scene, { coarsePointer });

    scene.add(new THREE.HemisphereLight(0xffefd0, 0x10192b, 1.35));
    const key = new THREE.DirectionalLight(0xffe1aa, 2.35);
    key.position.set(-5.4, 10, whiteSide ? 6.6 : -6.6);
    key.castShadow = true;
    key.shadow.mapSize.set(coarsePointer ? 512 : 2048, coarsePointer ? 512 : 2048);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 28;
    key.shadow.bias = -0.00045;
    key.shadow.normalBias = 0.018;
    key.shadow.radius = coarsePointer ? 1.1 : 2.35;
    scene.add(key);
    const rim = new THREE.PointLight(theme.glow, 14.5, 19, 2);
    rim.position.set(4.8, 3.6, whiteSide ? -4.8 : 4.8);
    scene.add(rim);
    const warm = new THREE.PointLight(0xffa449, 5.8, 16, 2);
    warm.position.set(-4.6, 4.4, whiteSide ? -5.8 : 5.8);
    scene.add(warm);

    const warRoom = buildWarRoom(theme, whiteSide, coarsePointer);
    scene.add(warRoom);
    scene.add(buildPremiumWarRoomLayer(theme, whiteSide, coarsePointer));

    const table = new THREE.Mesh(
      new THREE.BoxGeometry(11.6, 0.55, 11.6),
      new THREE.MeshPhysicalMaterial({ color: 0x1f120c, metalness: 0.08, roughness: 0.6, clearcoat: 0.28, clearcoatRoughness: 0.25, envMapIntensity: 0.74 }),
    );
    table.position.y = -0.48;
    table.receiveShadow = true;
    scene.add(table);
    scene.add(buildPremiumTableLayer(theme, coarsePointer));

    const pedestal = new THREE.Mesh(
      new THREE.BoxGeometry(9.35, 0.4, 9.35),
      new THREE.MeshPhysicalMaterial({ color: theme.frame, metalness: 0.08, roughness: 0.67, clearcoat: 0.18, clearcoatRoughness: 0.36, envMapIntensity: 0.48, specularIntensity: 0.42 }),
    );
    pedestal.position.y = -0.22;
    pedestal.receiveShadow = true;
    boardGroup.add(pedestal);

    const frameGold = new THREE.MeshPhysicalMaterial({ color: 0xa77a2d, metalness: 0.72, roughness: 0.24, clearcoat: 0.68, clearcoatRoughness: 0.12, envMapIntensity: 1.2 });
    const frameWood = new THREE.MeshPhysicalMaterial({ color: theme.frame, metalness: 0.025, roughness: 0.7, clearcoat: 0.15, clearcoatRoughness: 0.4, envMapIntensity: 0.42, specularIntensity: 0.36 });
    for (const [x, z, sx, sz] of [
      [0, 4.38, 9.05, 0.28], [0, -4.38, 9.05, 0.28],
      [4.38, 0, 0.28, 9.05], [-4.38, 0, 0.28, 9.05],
    ]) {
      addMesh(boardGroup, new THREE.BoxGeometry(sx, 0.18, sz), frameWood, [x, 0.03, z]);
    }
    for (const [x, z, sx, sz] of [
      [0, 4.16, 8.55, 0.055], [0, -4.16, 8.55, 0.055],
      [4.16, 0, 0.055, 8.55], [-4.16, 0, 0.055, 8.55],
    ]) {
      addMesh(boardGroup, new THREE.BoxGeometry(sx, 0.08, sz), frameGold, [x, 0.135, z]);
    }

    const lightTileMaterial = makePremiumTileMaterial({ color: theme.light, light: true, coarsePointer, seed: 0x531f });
    const darkTileMaterial = makePremiumTileMaterial({ color: theme.dark, light: false, coarsePointer, seed: 0xa72d });

    for (let rank = 1; rank <= 8; rank += 1) {
      for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
        const square = `${FILES[fileIndex]}${rank}`;
        const { x, z } = squarePosition(square);
        const light = (rank + fileIndex) % 2 === 1;
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(0.984, 0.105, 0.984),
          light ? lightTileMaterial : darkTileMaterial,
        );
        const tileSettling = ((fileIndex * 13 + rank * 7) % 5 - 2) * 0.0008;
        tile.position.set(x, 0.0525 + tileSettling, z);
        tile.receiveShadow = true;
        tile.userData.square = square;
        boardGroup.add(tile);
        squareMeshes.set(square, tile);

        const marker = new THREE.Mesh(
          new THREE.RingGeometry(0.29, 0.43, 32),
          new THREE.MeshBasicMaterial({ color: 0xc9a227, transparent: true, opacity: 0.86, side: THREE.DoubleSide, depthWrite: false }),
        );
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(x, 0.102, z);
        marker.visible = false;
        marker.renderOrder = 4;
        boardGroup.add(marker);
        highlightMeshes.set(square, marker);
      }
    }

    boardGroup.add(pieceGroup);
    boardGroup.add(coordinateGroup);
    scene.add(boardGroup);

    if (showCoordinates) {
      const fileOrder = whiteSide ? FILES : [...FILES].reverse();
      const rankOrder = whiteSide ? ['1','2','3','4','5','6','7','8'] : ['8','7','6','5','4','3','2','1'];
      fileOrder.forEach((file, index) => {
        const sprite = makeTextSprite(file.toUpperCase(), '#d4aa54');
        sprite.position.set(index - 3.5, 0.16, whiteSide ? 4.68 : -4.68);
        coordinateGroup.add(sprite);
      });
      rankOrder.forEach((rank, index) => {
        const sprite = makeTextSprite(rank, '#d4aa54');
        sprite.position.set(whiteSide ? -4.68 : 4.68, 0.16, whiteSide ? 3.5 - index : -3.5 + index);
        coordinateGroup.add(sprite);
      });
    }

    function render() {
      renderer.render(scene, camera);
    }

    function resize() {
      const width = Math.max(280, host.clientWidth || 280);
      const height = Math.max(300, host.clientHeight || 300);
      renderer.setSize(width, height, false);
      fitBoardCamera(camera, width, height, whiteSide);
      render();
    }
    resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(host);

    function squareFromPointer(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const intersections = raycaster.intersectObjects([...pieceGroup.children, ...squareMeshes.values()], true);
      for (const hit of intersections) {
        let object = hit.object;
        while (object && !object.userData?.square) object = object.parent;
        if (object?.userData?.square) return object.userData.square;
      }
      return null;
    }

    function selectSquareFromTouch(event) {
      const square = squareFromPointer(event);
      renderer.domElement.dataset.warRoomLastSquare = square || '';
      if (!square) return false;
      setFocusedSquare(square);
      latestPropsRef.current.onSquareClick?.(square);
      return true;
    }

    function onPointerDown(event) {
      const touchLike = event.pointerType === 'touch' || event.pointerType === 'pen';
      pointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
        pointerType: event.pointerType,
        handled: false,
      };
      if (inspectModeRef.current) {
        const motion = cameraMotionRef.current;
        motion.dragging = true;
        motion.lastX = event.clientX;
        motion.lastY = event.clientY;
        renderer.domElement.setPointerCapture?.(event.pointerId);
        return;
      }
      if (!touchLike) return;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      renderer.domElement.dataset.warRoomTouchStage = 'down';
      const handled = selectSquareFromTouch(event);
      if (pointerStartRef.current) pointerStartRef.current.handled = handled;
    }

    function onPointerMove(event) {
      const motion = cameraMotionRef.current;
      if (inspectModeRef.current) {
        renderer.domElement.style.cursor = motion.dragging ? 'grabbing' : 'grab';
        if (motion.dragging) {
          const dx = event.clientX - motion.lastX;
          const dy = event.clientY - motion.lastY;
          motion.lastX = event.clientX;
          motion.lastY = event.clientY;
          motion.yaw = THREE.MathUtils.clamp(motion.yaw - dx * 0.0023, -0.14, 0.14);
          motion.pitch = THREE.MathUtils.clamp(motion.pitch - dy * 0.0018, -0.08, 0.075);
        }
        return;
      }
      if (coarsePointer) return;
      const square = squareFromPointer(event);
      const pieceHover = square && pieceMeshes.has(square) ? square : null;
      renderer.domElement.style.cursor = pieceHover ? 'pointer' : 'default';
      setHoveredSquare((current) => current === pieceHover ? current : pieceHover);
    }

    function onPointerLeave() {
      const motion = cameraMotionRef.current;
      motion.targetX = 0;
      motion.targetY = 0;
      motion.dragging = false;
      renderer.domElement.style.cursor = 'default';
      setHoveredSquare(null);
    }

    function releasePointer(event) {
      try {
        if (renderer.domElement.hasPointerCapture?.(event.pointerId)) {
          renderer.domElement.releasePointerCapture?.(event.pointerId);
        }
      } catch {
        // Android/WebView can already have released capture on cancellation.
      }
    }

    function onPointerCancel(event) {
      pointerStartRef.current = null;
      cameraMotionRef.current.dragging = false;
      renderer.domElement.dataset.warRoomTouchStage = 'cancel';
      releasePointer(event);
    }

    function onPointerUp(event) {
      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      if (inspectModeRef.current) {
        cameraMotionRef.current.dragging = false;
        renderer.domElement.style.cursor = 'grab';
        releasePointer(event);
        return;
      }
      if (start?.handled) {
        renderer.domElement.dataset.warRoomTouchStage = 'up';
        releasePointer(event);
        return;
      }
      const touchLike = coarsePointer || start?.pointerType === 'touch' || start?.pointerType === 'pen';
      const tap = resolveBoardTap(
        start,
        { x: event.clientX, y: event.clientY, id: event.pointerId },
        { coarsePointer: touchLike },
      );
      if (!tap) {
        releasePointer(event);
        return;
      }
      const square = squareFromPointer({ clientX: tap.x, clientY: tap.y });
      renderer.domElement.dataset.warRoomLastSquare = square || '';
      if (!square) {
        releasePointer(event);
        return;
      }
      setFocusedSquare(square);
      latestPropsRef.current.onSquareClick?.(square);
      releasePointer(event);
    }

    function onContextLost(event) {
      event.preventDefault();
      latestPropsRef.current.onRendererFailure?.(new Error('WebGL context lost'));
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown, { passive: true });
    renderer.domElement.addEventListener('pointermove', onPointerMove, { passive: true });
    renderer.domElement.addEventListener('pointerleave', onPointerLeave, { passive: true });
    renderer.domElement.addEventListener('pointerup', onPointerUp, { passive: true });
    renderer.domElement.addEventListener('pointercancel', onPointerCancel, { passive: true });
    renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);

    let lastAmbientPaint = 0;
    function ambientFrame(now) {
      const motion = cameraMotionRef.current;
      const reduced = getEffectiveReducedMotion();
      if (!document.hidden && !reduced && !coarsePointer && inspectModeRef.current && now - lastAmbientPaint >= 16) {
        lastAmbientPaint = now;
        const basePosition = camera.userData.basePosition;
        const baseTarget = camera.userData.baseTarget;
        if (basePosition && baseTarget) {
          const offset = basePosition.clone().sub(baseTarget).applyEuler(new THREE.Euler(motion.pitch, motion.yaw, 0, 'YXZ'));
          camera.position.copy(baseTarget).add(offset);
          camera.lookAt(baseTarget);
          render();
        }
      }
      ambientFrameRef.current = window.requestAnimationFrame(ambientFrame);
    }
    if (!coarsePointer) ambientFrameRef.current = window.requestAnimationFrame(ambientFrame);

    sceneStateRef.current = {
      scene,
      camera,
      renderer,
      pieceGroup,
      pieceMeshes,
      highlightMeshes,
      coarsePointer,
      key,
      rim,
      warm,
      render,
      renderScale: Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.25 : 1.75),
      slowFrameCount: 0,
    };
    setRendererLabel(renderer.capabilities.isWebGL2 ? '3D · WEBGL2' : '3D · WEBGL');
    render();

    return () => {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
      window.cancelAnimationFrame(ambientFrameRef.current);
      ambientFrameRef.current = 0;
      observer?.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((object) => {
        if (object.userData?.ownedTexture) object.userData.ownedTexture.dispose();
      });
      releaseEnvironment();
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      sceneStateRef.current = null;
    };
  }, [boardTheme, orientation, showCoordinates]);

  useEffect(() => {
  const state = sceneStateRef.current;
  if (!state) return undefined;
  window.cancelAnimationFrame(animationFrameRef.current);
  animationFrameRef.current = 0;

  const previousPieces = parseFen(previousFenRef.current);
  const nextPieces = parseFen(fen);
  const movingBefore = animate?.from ? previousPieces.find((piece) => piece.square === animate.from) : null;
  const movingAfter = animate?.to ? nextPieces.find((piece) => piece.square === animate.to) : null;
  const capturedPiece = inferCapturedPiece(previousPieces, nextPieces, animate);
  const promotion = Boolean(movingBefore?.type === 'p' && movingAfter && movingAfter.type !== 'p');
  const fromFile = FILES.indexOf(animate?.from?.[0]);
  const toFile = FILES.indexOf(animate?.to?.[0]);
  const castling = Boolean(movingBefore?.type === 'k' && fromFile >= 0 && toFile >= 0 && Math.abs(toFile - fromFile) === 2);

  for (const child of [...state.pieceGroup.children]) {
    state.pieceGroup.remove(child);
    disposeObject(child);
  }
  state.pieceMeshes.clear();

  for (const piece of nextPieces) {
    const matthiasKing = isMatthiasRivalKing(piece, matthiasKingColor);
    const mesh = buildPiece(piece.type, piece.color, skinId, state.coarsePointer, {
      matthiasKing,
      faceTowardCamera: orientation !== 'black',
    });
    const { x, z } = squarePosition(piece.square);
    mesh.position.set(x, 0.1, z);
    mesh.userData.square = piece.square;
    mesh.userData.type = piece.type;
    mesh.userData.color = piece.color;
    mesh.userData.baseY = 0.1;
    mesh.userData.baseScale = mesh.scale.clone();
    if (matthiasKing) mesh.userData.matthiasKing = true;
    mesh.traverse((object) => { object.userData.square = piece.square; });
    addCoarsePieceHitTarget(mesh, piece.square, state.coarsePointer);
    state.pieceGroup.add(mesh);
    state.pieceMeshes.set(piece.square, mesh);
  }

  previousFenRef.current = fen;
  const animatedMesh = animate?.to ? state.pieceMeshes.get(animate.to) : null;
  const shouldAnimate = Boolean(
    animatedMesh
    && animate?.from
    && animate?.to
    && animate?.seq
    && animate.seq !== lastAnimatedSeqRef.current
    && !getEffectiveReducedMotion(),
  );

  if (!shouldAnimate) {
    if (animate?.seq) lastAnimatedSeqRef.current = animate.seq;
    applyMatthiasCheckPose(state, checkSquare, orientation);
    state.render();
    return undefined;
  }

  lastAnimatedSeqRef.current = animate.seq;
  const from = squarePosition(animate.from);
  const to = squarePosition(animate.to);
  const kinetics = deriveMoveKinetics({
    movingType: movingBefore?.type || movingAfter?.type,
    capture: Boolean(animate.capture),
    promotion,
    castling,
    coarsePointer: state.coarsePointer,
  });
  const start = performance.now();
  const baseScale = animatedMesh.scale.clone();
  let capturedGhost = null;
  let castleRook = null;
  let castleFrom = null;
  let castleTo = null;

  if (capturedPiece) {
    capturedGhost = buildPiece(capturedPiece.type, capturedPiece.color, skinId, state.coarsePointer, {
      matthiasKing: isMatthiasRivalKing(capturedPiece, matthiasKingColor),
      faceTowardCamera: orientation !== 'black',
    });
    const capturedPosition = squarePosition(capturedPiece.square);
    capturedGhost.position.set(capturedPosition.x, 0.1, capturedPosition.z);
    capturedGhost.userData.captureGhost = true;
    state.pieceGroup.add(capturedGhost);
  }

  if (castling) {
    const rank = animate.to[1];
    const kingSide = toFile > fromFile;
    const rookFromSquare = `${kingSide ? 'h' : 'a'}${rank}`;
    const rookToSquare = `${kingSide ? 'f' : 'd'}${rank}`;
    castleRook = state.pieceMeshes.get(rookToSquare) || null;
    castleFrom = squarePosition(rookFromSquare);
    castleTo = squarePosition(rookToSquare);
    if (castleRook) castleRook.position.set(castleFrom.x, 0.1, castleFrom.z);
  }

  function setOpacity(group, opacity) {
    group?.traverse?.((object) => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!material) return;
        material.transparent = opacity < 0.999;
        material.opacity = opacity;
        if (opacity < 0.999) material.depthWrite = false;
      });
    });
  }

  function frame(now) {
    const raw = Math.min(1, Math.max(0, (now - start) / kinetics.duration));
    const progress = animate.kind === 'miss'
      ? (raw < 0.5 ? raw * 0.72 : (1 - raw) * 0.72)
      : easeOutCubic(raw);
    animatedMesh.position.x = to.x + (from.x - to.x) * (1 - progress);
    animatedMesh.position.z = to.z + (from.z - to.z) * (1 - progress);
    animatedMesh.position.y = 0.1 + Math.sin(raw * Math.PI) * (animate.kind === 'miss' ? 0.08 : kinetics.lift);

    if (animate.capture && capturedGhost) {
      const impact = smoothstep(kinetics.impactStart, 0.9, raw);
      const side = orientation === 'black' ? -1 : 1;
      capturedGhost.rotation.z = side * kinetics.captureTilt * impact;
      capturedGhost.rotation.x = impact * 0.16;
      capturedGhost.position.y = 0.1 - impact * 0.075;
      capturedGhost.scale.multiplyScalar(1 - impact * 0.0016);
      setOpacity(capturedGhost, 1 - impact * 0.92);
      animatedMesh.rotation.z = Math.sin(impact * Math.PI) * 0.045 * side;
    }

    if (promotion && raw > 0.62) {
      const pulseT = (raw - 0.62) / 0.38;
      const pulse = Math.sin(Math.min(1, pulseT) * Math.PI) * kinetics.promotionPulse;
      animatedMesh.scale.copy(baseScale).multiplyScalar(1 + pulse);
      state.rim.intensity = 14.5 + pulse * 56;
    }

    if (castleRook && castleFrom && castleTo) {
      const rookRaw = clamp01((raw - kinetics.rookDelay) / Math.max(0.01, 1 - kinetics.rookDelay));
      const rookProgress = easeOutCubic(rookRaw);
      castleRook.position.x = castleTo.x + (castleFrom.x - castleTo.x) * (1 - rookProgress);
      castleRook.position.z = castleTo.z + (castleFrom.z - castleTo.z) * (1 - rookProgress);
      castleRook.position.y = 0.1 + Math.sin(rookRaw * Math.PI) * 0.075;
    }

    const dt = state.lastAnimationFrameAt ? now - state.lastAnimationFrameAt : 16;
    state.lastAnimationFrameAt = now;
    state.slowFrameCount = dt > 23 ? state.slowFrameCount + 1 : Math.max(0, state.slowFrameCount - 1);
    const requestedScale = adaptiveRenderScale({ coarsePointer: state.coarsePointer, slowFrameCount: state.slowFrameCount });
    const cappedScale = Math.min(window.devicePixelRatio || 1, requestedScale);
    if (cappedScale + 0.05 < state.renderScale) {
      state.renderScale = cappedScale;
      state.renderer.setPixelRatio(cappedScale);
      const host = hostRef.current;
      if (host) state.renderer.setSize(Math.max(280, host.clientWidth || 280), Math.max(300, host.clientHeight || 300), false);
    }

    state.render();
    if (raw < 1) animationFrameRef.current = window.requestAnimationFrame(frame);
    else {
      animatedMesh.position.set(to.x, 0.1, to.z);
      animatedMesh.rotation.z = 0;
      animatedMesh.scale.copy(baseScale);
      if (castleRook && castleTo) castleRook.position.set(castleTo.x, 0.1, castleTo.z);
      if (capturedGhost) {
        state.pieceGroup.remove(capturedGhost);
        disposeObject(capturedGhost);
        capturedGhost = null;
      }
      const lights = reactiveLightProfile({ check: Boolean(checkSquare), gameOver, coarsePointer: state.coarsePointer });
      state.key.intensity = lights.key;
      state.rim.intensity = lights.rim;
      state.warm.intensity = lights.warm;
      state.renderer.toneMappingExposure = lights.exposure;
      applyMatthiasCheckPose(state, checkSquare, orientation);
      state.render();
      animationFrameRef.current = 0;
      state.lastAnimationFrameAt = 0;
    }
  }

  animatedMesh.position.set(from.x, 0.1, from.z);
  state.render();
  animationFrameRef.current = window.requestAnimationFrame(frame);
  return () => {
    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = 0;
    if (capturedGhost) {
      state.pieceGroup.remove(capturedGhost);
      disposeObject(capturedGhost);
    }
  };
}, [fen, skinId, animate, boardTheme, orientation, showCoordinates, matthiasKingColor, checkSquare, gameOver]);

  const legalMap = useMemo(() => new Map((legalTargets || []).map((target) => {
    const square = target?.to || target?.square || target;
    const capture = Boolean(target?.captured || target?.san?.includes?.('x'));
    return [square, capture];
  })), [legalTargets]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return;
    for (const [square, marker] of state.highlightMeshes.entries()) {
      marker.visible = false;
      let color = null;
      let opacity = 0.86;
      if (focusedSquare === square) { color = 0xe8dfc3; opacity = 0.42; }
      if (hoveredSquare === square) { color = 0x8bc7e8; opacity = 0.58; }
      if (lastMove && (square === lastMove.from || square === lastMove.to)) color = 0xb9952e;
      if (hintMove && (square === hintMove.from || square === hintMove.to)) color = 0x50a4c6;
      if (legalMap.has(square)) color = legalMap.get(square) ? 0xb4483a : 0x5fa8d3;
      if (selectedSquare === square) { color = 0xe0b84e; opacity = 0.96; }
      if (checkSquare === square) { color = 0xe33b32; opacity = 1; }
      if (color != null) {
        marker.material.color.setHex(color);
        marker.material.opacity = opacity;
        marker.visible = true;
      }
    }
    applyMatthiasCheckPose(state, checkSquare, orientation);
    state.render();
  }, [selectedSquare, legalMap, lastMove, hintMove, checkSquare, focusedSquare, hoveredSquare, boardTheme, orientation, showCoordinates]);

useEffect(() => {
  const state = sceneStateRef.current;
  if (!state) return;
  const lights = reactiveLightProfile({ check: Boolean(checkSquare), gameOver, coarsePointer: state.coarsePointer });
  state.key.intensity = lights.key;
  state.rim.intensity = lights.rim;
  state.warm.intensity = lights.warm;
  state.renderer.toneMappingExposure = lights.exposure;
  if (state.scene.fog?.isFogExp2) state.scene.fog.density = lights.fogDensity;
  applyMatthiasCheckPose(state, checkSquare, orientation);
  state.render();
}, [checkSquare, gameOver, boardTheme, orientation, showCoordinates]);

function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSquareClick?.(focusedSquare);
      return;
    }
    const next = adjacentSquare(focusedSquare, event.key, orientation);
    if (!next) return;
    event.preventDefault();
    setFocusedSquare(next);
  }

  return (
    <div
      className="board3d-main-shell"
      data-board3d-war-room="true"
      data-board3d-scene="premium"
      data-board3d-surface="premium-v2"
      data-board3d-motion="physical-v1"
      data-board3d-camera="fixed-tactical"
      data-board3d-inspect={inspectMode ? 'true' : 'false'}
      data-board3d-selected={selectedSquare || ''}
      data-board3d-focused={focusedSquare || ''}
      data-board3d-legal-target-count={legalMap.size}
      data-matthias-rival-king={matthiasKingColor || 'off'}
    >
      <div ref={hostRef} className="board3d-main-host" onKeyDown={handleKeyDown} />
      <div className="board3d-fixed-camera-note" aria-hidden="true">SALA DE GUERRA · {inspectMode ? 'INSPECCIÓN' : 'CÁMARA TÁCTICA'}</div>
      <div className="board3d-renderer-badge" aria-hidden="true">{rendererLabel}</div>
      <button type="button" className="board3d-inspect secondary-btn" aria-pressed={inspectMode} onClick={() => setInspectMode((value) => !value)}>{inspectMode ? 'Volver a jugar' : 'Inspeccionar'}</button>
      {onCustomize && <button type="button" className="board3d-customize secondary-btn" onClick={onCustomize}>Apariencia</button>}
    </div>
  );
}

export default function Board3D(props) {
  const [failed, setFailed] = useState(false);
  const handleRendererFailure = useCallback(() => setFailed(true), []);

  if (failed) {
    return (
      <div className="board3d-fallback">
        <div className="board3d-fallback-note">3D no disponible en este dispositivo · usando 2D</div>
        <Board {...props} />
      </div>
    );
  }

  return <Board3DCanvas {...props} onRendererFailure={handleRendererFailure} />;
}
