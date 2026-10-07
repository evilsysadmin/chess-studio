import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createThreeRenderer } from '../threeRenderer.js';

export const QUICK_MATCH_READY_ROOM_CAMERA = Object.freeze({
  fov: 31,
  position: Object.freeze([0, 5.15, 11.7]),
  target: Object.freeze([0, 1.42, -1.72]),
});

export const QUICK_MATCH_READY_ROOM_BOARD_LAYOUT = Object.freeze({
  centerX: -.28,
  centerY: 1.40,
  centerZ: -1.33,
  squareSize: .76,
});

export function quickMatchReadyRoomSquareCenter(file, rank) {
  const { centerX, centerZ, squareSize } = QUICK_MATCH_READY_ROOM_BOARD_LAYOUT;
  return Object.freeze([
    centerX + (file - 3.5) * squareSize,
    centerZ + (rank - 3.5) * squareSize,
  ]);
}

function mat(color, metalness = 0.04, roughness = 0.8, extra = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness,
    roughness,
    clearcoat: metalness > .35 ? .2 : 0,
    clearcoatRoughness: .42,
    ...extra,
  });
}

function box(root, size, material, position, name = '') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.receiveShadow = true;
  mesh.castShadow = /table|chair|clock|piece|frame|pilaster|console|beam|column/.test(name);
  mesh.name = name;
  root.add(mesh);
  return mesh;
}

function cylinder(root, radii, height, material, position, name = '', segments = 24) {
  const [topRadius, bottomRadius = topRadius] = radii;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius, bottomRadius, height, segments),
    material,
  );
  mesh.position.set(...position);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = name;
  root.add(mesh);
  return mesh;
}

function sphere(root, radius, material, position, name = '', widthSegments = 24, heightSegments = 16) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, widthSegments, heightSegments),
    material,
  );
  mesh.position.set(...position);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = name;
  root.add(mesh);
  return mesh;
}

function addBoard(root, lightSquare, darkSquare, trim, woodDark) {
  const board = new THREE.Group();
  board.name = 'quick-match-ready-board';

  box(board, [6.86, .20, 6.86], woodDark, [0, -.035, 0], 'board-underlay');
  box(board, [6.66, .17, 6.66], trim, [0, .035, 0], 'board-frame');
  box(board, [6.20, .10, 6.20], woodDark, [0, .12, 0], 'board-bed');

  const { centerX, centerY, centerZ, squareSize } = QUICK_MATCH_READY_ROOM_BOARD_LAYOUT;
  const squareGeo = new THREE.BoxGeometry(squareSize, .095, squareSize);
  const light = new THREE.InstancedMesh(squareGeo, lightSquare, 32);
  const dark = new THREE.InstancedMesh(squareGeo, darkSquare, 32);
  const matrix = new THREE.Matrix4();
  let lightIndex = 0;
  let darkIndex = 0;

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      matrix.makeTranslation((file - 3.5) * squareSize, .205, (rank - 3.5) * squareSize);
      const target = (rank + file) % 2 === 0 ? light : dark;
      target.setMatrixAt(target === light ? lightIndex++ : darkIndex++, matrix);
    }
  }

  light.instanceMatrix.needsUpdate = true;
  dark.instanceMatrix.needsUpdate = true;
  light.receiveShadow = true;
  dark.receiveShadow = true;
  board.add(light, dark);

  for (const z of [-3.23, 3.23]) {
    box(board, [6.54, .055, .065], trim, [0, .20, z], 'board-brass-fillet');
  }
  for (const x of [-3.23, 3.23]) {
    box(board, [.065, .055, 6.54], trim, [x, .20, 0], 'board-brass-fillet');
  }

  board.position.set(centerX, centerY, centerZ);
  root.add(board);
  return board;
}

function addPieceBase(group, material, scale) {
  cylinder(group, [.29 * scale, .36 * scale], .09 * scale, material, [0, .045 * scale, 0], 'piece-base', 28);
  cylinder(group, [.24 * scale, .29 * scale], .08 * scale, material, [0, .125 * scale, 0], 'piece-plinth', 28);
}

function addPawnPiece(root, x, z, material, scale = 1) {
  const piece = new THREE.Group();
  piece.name = 'ready-room-piece pawn';
  addPieceBase(piece, material, scale);
  cylinder(piece, [.13 * scale, .20 * scale], .30 * scale, material, [0, .31 * scale, 0], 'piece-body', 24);
  cylinder(piece, [.12 * scale, .14 * scale], .08 * scale, material, [0, .49 * scale, 0], 'piece-collar', 24);
  sphere(piece, .16 * scale, material, [0, .66 * scale, 0], 'piece-head', 24, 16);
  piece.position.set(x, 1.61, z);
  root.add(piece);
}

function addRookPiece(root, x, z, material, scale = 1) {
  const piece = new THREE.Group();
  piece.name = 'ready-room-piece rook';
  addPieceBase(piece, material, scale);
  cylinder(piece, [.18 * scale, .23 * scale], .36 * scale, material, [0, .36 * scale, 0], 'piece-body', 24);
  cylinder(piece, [.27 * scale, .20 * scale], .12 * scale, material, [0, .60 * scale, 0], 'piece-rook-crown', 24);
  for (let i = 0; i < 4; i += 1) {
    const battlement = box(piece, [.13 * scale, .12 * scale, .14 * scale], material, [0, .71 * scale, .20 * scale], 'piece-rook-battlement');
    battlement.rotation.y = i * Math.PI / 2;
    battlement.position.x = Math.sin(i * Math.PI / 2) * .20 * scale;
    battlement.position.z = Math.cos(i * Math.PI / 2) * .20 * scale;
  }
  piece.position.set(x, 1.61, z);
  root.add(piece);
}

function addBishopPiece(root, x, z, material, scale = 1) {
  const piece = new THREE.Group();
  piece.name = 'ready-room-piece bishop';
  addPieceBase(piece, material, scale);
  cylinder(piece, [.12 * scale, .23 * scale], .43 * scale, material, [0, .38 * scale, 0], 'piece-body', 28);
  cylinder(piece, [.16 * scale, .12 * scale], .08 * scale, material, [0, .62 * scale, 0], 'piece-collar', 28);
  const mitre = new THREE.Mesh(new THREE.ConeGeometry(.18 * scale, .34 * scale, 28), material);
  mitre.position.y = .82 * scale;
  mitre.castShadow = true;
  mitre.name = 'piece-bishop-mitre';
  piece.add(mitre);
  sphere(piece, .055 * scale, material, [0, 1.00 * scale, 0], 'piece-bishop-finial', 18, 12);
  piece.position.set(x, 1.61, z);
  root.add(piece);
}

function addKnightPiece(root, x, z, material, scale = 1, facing = 1) {
  const piece = new THREE.Group();
  piece.name = 'ready-room-piece knight';
  addPieceBase(piece, material, scale);
  cylinder(piece, [.15 * scale, .23 * scale], .28 * scale, material, [0, .32 * scale, 0], 'piece-body', 24);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.12 * scale, .18 * scale, .42 * scale, 20), material);
  neck.rotation.z = -.40 * facing;
  neck.position.set(.055 * facing * scale, .62 * scale, 0);
  neck.castShadow = true;
  neck.name = 'piece-knight-neck';
  piece.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(.17 * scale, 22, 14), material);
  head.scale.set(1.15, .86, .72);
  head.position.set(.22 * facing * scale, .82 * scale, 0);
  head.castShadow = true;
  head.name = 'piece-knight-head';
  piece.add(head);

  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(.20 * scale, .13 * scale, .18 * scale), material);
  muzzle.position.set(.34 * facing * scale, .76 * scale, 0);
  muzzle.rotation.z = -.08 * facing;
  muzzle.castShadow = true;
  muzzle.name = 'piece-knight-muzzle';
  piece.add(muzzle);

  for (const zOffset of [-.08, .08]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.055 * scale, .18 * scale, 12), material);
    ear.position.set(.15 * facing * scale, 1.00 * scale, zOffset * scale);
    ear.rotation.z = -.15 * facing;
    ear.castShadow = true;
    piece.add(ear);
  }

  piece.position.set(x, 1.61, z);
  root.add(piece);
}

function addRoyalPiece(root, x, z, material, scale = 1, king = false) {
  const piece = new THREE.Group();
  piece.name = `ready-room-piece ${king ? 'king' : 'queen'}`;
  addPieceBase(piece, material, scale);
  cylinder(piece, [.14 * scale, .25 * scale], .48 * scale, material, [0, .41 * scale, 0], 'piece-body', 28);
  cylinder(piece, [.21 * scale, .14 * scale], .09 * scale, material, [0, .69 * scale, 0], 'piece-collar', 28);

  if (king) {
    sphere(piece, .15 * scale, material, [0, .86 * scale, 0], 'piece-king-crown', 22, 14);
    box(piece, [.07 * scale, .29 * scale, .07 * scale], material, [0, 1.10 * scale, 0], 'piece-king-cross');
    box(piece, [.23 * scale, .07 * scale, .07 * scale], material, [0, 1.12 * scale, 0], 'piece-king-cross');
  } else {
    cylinder(piece, [.23 * scale, .19 * scale], .12 * scale, material, [0, .86 * scale, 0], 'piece-queen-crown', 20);
    sphere(piece, .075 * scale, material, [0, 1.02 * scale, 0], 'piece-queen-finial', 18, 12);
    for (let i = 0; i < 6; i += 1) {
      const gem = sphere(piece, .045 * scale, material, [
        Math.cos((i / 6) * Math.PI * 2) * .19 * scale,
        .96 * scale,
        Math.sin((i / 6) * Math.PI * 2) * .19 * scale,
      ], 'piece-queen-crown-point', 12, 8);
      gem.scale.y = 1.35;
    }
  }

  piece.position.set(x, 1.61, z);
  root.add(piece);
}

function addChessSet(root, ivory, ebony, lite = false) {
  const squareX = (file) => quickMatchReadyRoomSquareCenter(file, 0)[0];
  const squareZ = (rank) => quickMatchReadyRoomSquareCenter(0, rank)[1];

  // Camera side = White. Piece anchors and rendered squares share one layout
  // contract, so neither can drift independently.
  const whiteBackRankZ = squareZ(7);
  const whitePawnRankZ = squareZ(6);
  const blackPawnRankZ = squareZ(1);
  const blackBackRankZ = squareZ(0);

  const pawnFiles = lite ? [0, 2, 4, 6] : [0, 1, 2, 3, 4, 5, 6, 7];
  for (const file of pawnFiles) {
    addPawnPiece(root, squareX(file), whitePawnRankZ, ivory, .66);
    addPawnPiece(root, squareX(file), blackPawnRankZ, ebony, .66);
  }

  if (lite) return;

  const addBackRank = (z, material, facing) => {
    addRookPiece(root, squareX(0), z, material, .66);
    addKnightPiece(root, squareX(1), z, material, .66, facing);
    addBishopPiece(root, squareX(2), z, material, .66);
    addRoyalPiece(root, squareX(3), z, material, .66, false);
    addRoyalPiece(root, squareX(4), z, material, .66, true);
    addBishopPiece(root, squareX(5), z, material, .66);
    addKnightPiece(root, squareX(6), z, material, .66, facing);
    addRookPiece(root, squareX(7), z, material, .66);
  };

  addBackRank(whiteBackRankZ, ivory, -1);
  addBackRank(blackBackRankZ, ebony, 1);
}

function addChair(root, wood, leather, brass) {
  const chair = new THREE.Group();
  chair.name = 'quick-match-ready-opponent-chair';

  box(chair, [2.12, .26, 1.28], leather, [0, .64, 0], 'chair-seat');
  box(chair, [2.02, .12, 1.16], wood, [0, .48, 0], 'chair-seat-frame');

  const back = box(chair, [1.58, 1.56, .20], leather, [0, 1.68, -.61], 'chair-back');
  back.rotation.x = -.035;
  box(chair, [1.90, .12, .18], wood, [0, 2.51, -.65], 'chair-top-rail');
  box(chair, [1.42, .045, .055], brass, [0, 2.16, -.48], 'chair-brass-inlay');

  for (const x of [-.92, .92]) {
    cylinder(chair, [.085, .11], 2.36, wood, [x, 1.32, -.66], 'chair-post', 18);
    sphere(chair, .12, brass, [x, 2.58, -.66], 'chair-post-finial', 18, 12);
    cylinder(chair, [.09, .12], .92, wood, [x, .04, .43], 'chair-leg', 18);
  }

  const crest = new THREE.Mesh(new THREE.ConeGeometry(.17, .30, 3), brass);
  crest.rotation.z = Math.PI;
  crest.position.set(0, 2.69, -.64);
  crest.castShadow = true;
  crest.name = 'chair-crest';
  chair.add(crest);

  for (const x of [-.82, .82]) {
    box(chair, [.12, .12, 1.12], wood, [x, .92, .10], 'chair-arm');
    sphere(chair, .105, brass, [x, .98, .62], 'chair-brass-cap', 18, 12);
  }

  chair.position.set(0, .00, -5.04);
  root.add(chair);
}

function addSconce(root, x, brass, glow, warmGlass) {
  const sconce = new THREE.Group();
  sconce.name = 'quick-match-ready-sconce';
  cylinder(sconce, [.22, .22], .08, brass, [0, .12, 0], 'sconce-boss', 24);
  box(sconce, [.11, .48, .11], brass, [0, -.18, .18], 'sconce-arm');
  const cup = cylinder(sconce, [.18, .12], .18, brass, [0, -.42, .35], 'sconce-cup', 20);
  cup.rotation.x = Math.PI / 2;
  sphere(sconce, .19, warmGlass, [0, -.50, .42], 'sconce-glass', 22, 14);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(.075, .24, 16), glow);
  flame.position.set(0, -.36, .43);
  flame.name = 'sconce-flame';
  sconce.add(flame);
  sconce.position.set(x, 4.48, -6.03);
  root.add(sconce);
}

function addClock(root, brass, dark, wood) {
  const clock = new THREE.Group();
  clock.name = 'quick-match-ready-clock';
  box(clock, [2.12, .74, .66], wood, [0, .38, 0], 'clock-body');
  box(clock, [1.96, .58, .70], dark, [0, .38, .05], 'clock-face-panel');
  for (const x of [-.54, .54]) {
    const face = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, .05, 32), brass);
    face.rotation.x = Math.PI / 2;
    face.position.set(x, .40, .39);
    face.name = 'clock-face';
    clock.add(face);
    sphere(clock, .025, dark, [x, .40, .425], 'clock-hand-hub', 12, 8);
  }
  box(clock, [.48, .10, .32], brass, [-.54, .81, 0], 'clock-button-left');
  box(clock, [.48, .10, .32], brass, [.54, .81, 0], 'clock-button-right');
  clock.position.set(4.18, 1.48, -1.10);
  clock.rotation.y = -.09;
  root.add(clock);
}

function addWindow(root, stone, brass, night, moon, glow) {
  const windowGroup = new THREE.Group();
  windowGroup.name = 'quick-match-ready-window';

  box(windowGroup, [5.35, 4.12, .10], night, [0, 3.34, 0], 'window-night');
  box(windowGroup, [.28, 4.44, .34], stone, [-2.83, 3.34, .04], 'window-jamb-left');
  box(windowGroup, [.28, 4.44, .34], stone, [2.83, 3.34, .04], 'window-jamb-right');
  box(windowGroup, [5.96, .28, .34], stone, [0, 1.08, .04], 'window-sill');
  box(windowGroup, [.10, 4.06, .20], brass, [0, 3.34, .12], 'window-mullion');
  box(windowGroup, [5.28, .08, .20], brass, [0, 3.34, .12], 'window-transom');

  for (const x of [-2.78, 2.78]) {
    cylinder(windowGroup, [.20, .25], .28, brass, [x, 1.08, .18], 'window-brass-cap', 22);
    cylinder(windowGroup, [.20, .25], .28, brass, [x, 5.55, .18], 'window-brass-cap', 22);
  }

  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(.35, 28, 18), moon);
  moonMesh.position.set(1.52, 4.76, .18);
  moonMesh.name = 'window-moon';
  windowGroup.add(moonMesh);

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(.66, 36),
    glow,
  );
  halo.position.set(1.52, 4.76, .16);
  halo.name = 'window-moon-halo';
  windowGroup.add(halo);

  const starMaterial = new THREE.PointsMaterial({
    color: 0xc7ddf2,
    size: .026,
    transparent: true,
    opacity: .72,
    sizeAttenuation: true,
  });
  const starPositions = [];
  for (let i = 0; i < 54; i += 1) {
    const px = -2.45 + ((i * 37) % 97) / 96 * 4.9;
    const py = 1.55 + ((i * 61) % 101) / 100 * 3.55;
    if (Math.hypot(px - 1.52, py - 4.76) > .68) {
      starPositions.push(px, py, .20);
    }
  }
  const starsGeo = new THREE.BufferGeometry();
  starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starsGeo, starMaterial);
  stars.name = 'window-stars';
  windowGroup.add(stars);

  windowGroup.position.set(0, .03, -6.22);
  root.add(windowGroup);
}

function addHeraldicTrophy(root, x, leather, brass, steel) {
  const trophy = new THREE.Group();
  trophy.name = 'quick-match-ready-heraldry';

  for (const direction of [-1, 1]) {
    const blade = box(
      trophy,
      [.105, 1.66, .055],
      steel,
      [direction * .24, .03, .04],
      'wall-sword-blade',
    );
    blade.rotation.z = direction * .61;
    const guard = box(
      trophy,
      [.46, .075, .085],
      brass,
      [direction * .62, -.58, .08],
      'wall-sword-guard',
    );
    guard.rotation.z = direction * .61;
    sphere(
      trophy,
      .085,
      brass,
      [direction * .70, -.76, .09],
      'wall-sword-pommel',
      16,
      10,
    );
  }

  const shieldShape = new THREE.Shape();
  shieldShape.moveTo(0, .70);
  shieldShape.lineTo(.58, .43);
  shieldShape.lineTo(.49, -.28);
  shieldShape.quadraticCurveTo(.32, -.73, 0, -.96);
  shieldShape.quadraticCurveTo(-.32, -.73, -.49, -.28);
  shieldShape.lineTo(-.58, .43);
  shieldShape.closePath();

  const shield = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shieldShape, {
      depth: .09,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: .035,
      bevelThickness: .025,
    }),
    leather,
  );
  shield.position.z = .13;
  shield.castShadow = true;
  shield.receiveShadow = true;
  shield.name = 'wall-heater-shield';
  trophy.add(shield);

  box(trophy, [.095, 1.18, .055], brass, [0, -.02, .27], 'wall-shield-cross-vertical');
  box(trophy, [.82, .095, .055], brass, [0, .20, .27], 'wall-shield-cross-horizontal');

  trophy.position.set(x, 1.88, -5.90);
  trophy.scale.setScalar(.82);
  root.add(trophy);
}

function addConsole(root, x, wood, brass, leather) {
  const console = new THREE.Group();
  console.name = 'quick-match-ready-console';
  box(console, [2.35, .18, .72], wood, [0, 1.18, 0], 'console-top');
  box(console, [2.05, .62, .52], leather, [0, .82, -.03], 'console-front');
  for (const legX of [-.91, .91]) {
    cylinder(console, [.075, .10], 1.04, wood, [legX, .55, 0], 'console-leg', 16);
  }
  box(console, [1.84, .055, .055], brass, [0, .96, .38], 'console-brass-line');
  console.position.set(x, 0, -4.92);
  root.add(console);
}

function buildRoom({ lite = false } = {}) {
  const root = new THREE.Group();
  root.name = 'quick-match-ready-room';

  const stone = mat(0x46403b, .02, .90);
  const stoneEdge = mat(0x736a60, .03, .76);
  const stoneHighlight = mat(0x948878, .04, .68);
  const wood = mat(0x6a3e24, .08, .54);
  const woodDark = mat(0x2a1710, .05, .72);
  const brass = mat(0xb68b43, .82, .24);
  const leather = mat(0x4a201d, .05, .70);
  const steel = mat(0x8d9396, .74, .27);
  const ivory = mat(0xd8cfba, .06, .42);
  const ebony = mat(0x2d2b2b, .30, .30);
  const lightSquare = mat(0xcfc7b3, .04, .66);
  const darkSquare = mat(0x4a4843, .05, .58);
  const night = new THREE.MeshBasicMaterial({ color: 0x0b3156 });
  const moon = new THREE.MeshBasicMaterial({ color: 0xe8eef3 });
  const moonHalo = new THREE.MeshBasicMaterial({
    color: 0x9ec8ee,
    transparent: true,
    opacity: .12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const sconceGlow = new THREE.MeshStandardMaterial({
    color: 0xffd9a4,
    emissive: 0xff7f2f,
    emissiveIntensity: 3.2,
    metalness: 0,
    roughness: .30,
  });
  const warmGlass = new THREE.MeshPhysicalMaterial({
    color: 0xf3bc76,
    emissive: 0xff8a3a,
    emissiveIntensity: 1.4,
    transparent: true,
    opacity: .76,
    roughness: .18,
    transmission: .10,
  });

  box(root, [18, .45, 14], stone, [0, -.27, -1.0], 'floor');
  box(root, [18, 7.2, .42], stone, [0, 3.25, -6.45], 'back-wall');
  box(root, [.42, 7.2, 12], stone, [-8.8, 3.25, -.7], 'left-wall');
  box(root, [.42, 7.2, 12], stone, [8.8, 3.25, -.7], 'right-wall');

  box(root, [17.2, .30, .24], stoneEdge, [0, .34, -6.10], 'room-base-course');
  box(root, [17.2, .12, .18], brass, [0, 3.00, -6.02], 'room-brass-rail');
  box(root, [17.3, .36, .34], stoneEdge, [0, 6.45, -6.12], 'room-cornice');

  for (const x of [-7.8, -3.2, 3.2, 7.8]) {
    box(root, [.34, 6.72, .54], stoneEdge, [x, 3.18, -6.11], 'pilaster');
    box(root, [.54, .18, .72], stoneHighlight, [x, .37, -5.98], 'pilaster-base');
    box(root, [.58, .20, .72], stoneHighlight, [x, 6.36, -5.98], 'pilaster-cap');
  }

  for (const x of [-5.95, 5.95]) {
    box(root, [3.15, 2.45, .16], woodDark, [x, 1.82, -6.13], 'wall-panel');
    box(root, [2.72, 2.02, .08], leather, [x, 1.82, -6.02], 'wall-panel-inset');
    box(root, [2.86, .06, .10], brass, [x, 2.72, -5.96], 'wall-panel-fillet');
    box(root, [2.86, .06, .10], brass, [x, .92, -5.96], 'wall-panel-fillet');
  }

  for (const x of [-6.65, -2.2, 2.2, 6.65]) {
    box(root, [.22, .42, 12.0], woodDark, [x, 6.78, -.65], 'ceiling-beam');
  }

  addWindow(root, stoneEdge, brass, night, moon, moonHalo);
  addSconce(root, -5.55, brass, sconceGlow, warmGlass);
  addSconce(root, 5.55, brass, sconceGlow, warmGlass);
  addHeraldicTrophy(root, -5.95, leather, brass, steel);
  addHeraldicTrophy(root, 5.95, leather, brass, steel);
  addConsole(root, -6.15, woodDark, brass, leather);
  addConsole(root, 6.15, woodDark, brass, leather);

  const table = box(root, [10.65, .42, 5.12], wood, [0, 1.08, -1.16], 'table-top');
  table.rotation.x = -.018;
  box(root, [10.05, .17, 4.55], brass, [0, .86, -1.16], 'table-brass-skirt');
  box(root, [9.86, .28, 4.38], woodDark, [0, .69, -1.16], 'table-apron');

  for (const x of [-4.58, 4.58]) {
    for (const z of [-2.52, .18]) {
      cylinder(root, [.19, .25], 1.66, woodDark, [x, .02, z], 'table-leg', 20);
      cylinder(root, [.25, .31], .12, brass, [x, .78, z], 'table-leg-cap', 20);
    }
  }

  addBoard(root, lightSquare, darkSquare, brass, woodDark);
  addChessSet(root, ivory, ebony, lite);
  addClock(root, brass, ebony, woodDark);
  addChair(root, woodDark, leather, brass);

  const rugMaterial = mat(0x421416, .01, .98);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(10.8, 7.6), rugMaterial);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, -.035, -1.28);
  rug.receiveShadow = true;
  rug.name = 'quick-match-ready-rug';
  root.add(rug);

  const rugTrim = mat(0x9b6e2f, .38, .64);
  for (const z of [-5.02, 2.46]) {
    box(root, [10.62, .025, .055], rugTrim, [0, -.02, z], 'quick-match-ready-rug-border');
  }
  for (const x of [-5.28, 5.28]) {
    box(root, [.055, .025, 7.44], rugTrim, [x, -.02, -1.28], 'quick-match-ready-rug-border');
  }

  return root;
}

function renderScene(renderer, scene, camera, host) {
  if (!renderer || !scene || !camera || !host) return;
  const rect = host.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

export default function QuickMatchReadyRoomScene3D() {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const host = canvas.parentElement;
    const width = Math.max(0, Number(globalThis.innerWidth) || host?.clientWidth || 0);
    const height = Math.max(0, Number(globalThis.innerHeight) || host?.clientHeight || 0);

    if (width < 720 || height < 520) {
      setStatus('fallback-mobile');
      return undefined;
    }

    const coarsePointer = Boolean(globalThis.matchMedia?.('(pointer: coarse)')?.matches);
    let renderer;
    let scene;
    let room;
    let observer;
    let onResize;

    try {
      renderer = createThreeRenderer({
        canvas,
        alpha: true,
        antialias: !coarsePointer,
        powerPreference: coarsePointer ? 'low-power' : 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 2.20;
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, coarsePointer ? 1 : 1.35));
      renderer.shadowMap.enabled = !coarsePointer;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0b0908, .0064);

      const camera = new THREE.PerspectiveCamera(QUICK_MATCH_READY_ROOM_CAMERA.fov, 1, .1, 70);
      camera.position.set(...QUICK_MATCH_READY_ROOM_CAMERA.position);
      camera.lookAt(...QUICK_MATCH_READY_ROOM_CAMERA.target);

      const hemi = new THREE.HemisphereLight(0x9ab6d5, 0x3b2417, coarsePointer ? 1.12 : 1.58);
      scene.add(hemi);

      const warmLeft = new THREE.PointLight(0xffa654, coarsePointer ? 2.05 : 3.45, 20, 2);
      warmLeft.position.set(-5.55, 4.2, -4.6);
      warmLeft.castShadow = false;
      scene.add(warmLeft);

      const warmRight = new THREE.PointLight(0xffc06b, coarsePointer ? 1.48 : 2.55, 19, 2);
      warmRight.position.set(5.55, 4.0, -4.4);
      warmRight.castShadow = false;
      scene.add(warmRight);

      const moonFill = new THREE.DirectionalLight(0xa1c7f2, 1.18);
      moonFill.position.set(1.5, 6.5, -4.8);
      moonFill.target.position.set(0, 1.1, -1.4);
      moonFill.castShadow = false;
      scene.add(moonFill, moonFill.target);

      const cameraFill = new THREE.PointLight(0xffd7aa, coarsePointer ? .74 : 1.36, 25, 2);
      cameraFill.position.set(-.35, 5.15, 7.8);
      cameraFill.castShadow = false;
      scene.add(cameraFill);

      const boardFill = new THREE.PointLight(0xffe2bd, coarsePointer ? .38 : .72, 17, 2);
      boardFill.position.set(0, 6.2, -1.1);
      boardFill.castShadow = false;
      scene.add(boardFill);

      const boardKey = new THREE.SpotLight(
        0xffd7a0,
        coarsePointer ? .72 : 2.15,
        22,
        Math.PI / 5.2,
        .58,
        1.7,
      );
      boardKey.position.set(-1.4, 7.4, 3.4);
      boardKey.target.position.set(-.2, 1.35, -1.35);
      boardKey.castShadow = !coarsePointer;
      if (boardKey.castShadow) {
        boardKey.shadow.mapSize.set(1024, 1024);
        boardKey.shadow.bias = -.00045;
        boardKey.shadow.normalBias = .018;
        boardKey.shadow.camera.near = 1.5;
        boardKey.shadow.camera.far = 22;
      }
      scene.add(boardKey, boardKey.target);

      room = buildRoom({ lite: coarsePointer });
      scene.add(room);

      const draw = () => renderScene(renderer, scene, camera, host);
      draw();

      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(draw);
        observer.observe(host);
      } else {
        onResize = draw;
        globalThis.addEventListener?.('resize', onResize);
      }

      setStatus('ready');
    } catch {
      setStatus('fallback');
    }

    return () => {
      observer?.disconnect?.();
      if (onResize) globalThis.removeEventListener?.('resize', onResize);
      if (room) scene?.remove?.(room);
      renderer?.dispose?.();
      room?.traverse?.((node) => {
        node.geometry?.dispose?.();
        if (Array.isArray(node.material)) node.material.forEach((entry) => entry?.dispose?.());
        else node.material?.dispose?.();
      });
    };
  }, []);

  return (
    <div
      className={`quick-match-ready-room__scene is-${status}`}
      data-quick-match-ready-room-3d={status}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
