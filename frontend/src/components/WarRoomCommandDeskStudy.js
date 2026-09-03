import * as THREE from 'three';
import { registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';

export const WAR_ROOM_COMMAND_DESK_STUDY_VERSION = 'command-desk-study-v2';

function physical(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0,
    roughness: options.roughness ?? 0.68,
    clearcoat: options.clearcoat ?? 0.08,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.38,
    specularIntensity: options.specularIntensity ?? 0.28,
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

function addStudyPiece(group, {
  x,
  z,
  kind = 'pawn',
  dark = false,
  y = 1.218,
}) {
  const piece = new THREE.Group();
  piece.name = 'war-room-command-desk-study-piece';
  piece.userData.studyKind = kind;
  piece.userData.studySide = dark ? 'dark' : 'light';
  piece.position.set(x, y, z);

  const mat = physical(dark ? 0x202126 : 0xe9dcc0, {
    roughness: dark ? 0.34 : 0.39,
    clearcoat: 0.28,
    clearcoatRoughness: 0.21,
    specularIntensity: 0.5,
  });
  const segments = 10;

  addMesh(piece, new THREE.CylinderGeometry(0.025, 0.033, 0.019, segments), mat, [0, 0.0095, 0]);

  if (kind === 'rook') {
    addMesh(piece, new THREE.CylinderGeometry(0.019, 0.027, 0.046, segments), mat, [0, 0.041, 0]);
    addMesh(piece, new THREE.BoxGeometry(0.046, 0.019, 0.046), mat, [0, 0.073, 0]);
  } else if (kind === 'bishop') {
    addMesh(piece, new THREE.CylinderGeometry(0.014, 0.024, 0.048, segments), mat, [0, 0.042, 0]);
    addMesh(piece, new THREE.ConeGeometry(0.024, 0.045, segments), mat, [0, 0.084, 0]);
  } else if (kind === 'knight') {
    addMesh(piece, new THREE.CylinderGeometry(0.015, 0.025, 0.043, segments), mat, [0, 0.039, 0]);
    addMesh(piece, new THREE.ConeGeometry(0.025, 0.055, 5), mat, [0.008, 0.082, 0], [0, 0, -0.34]);
  } else if (kind === 'queen') {
    addMesh(piece, new THREE.CylinderGeometry(0.016, 0.026, 0.057, segments), mat, [0, 0.047, 0]);
    addMesh(piece, new THREE.SphereGeometry(0.023, segments, 8), mat, [0, 0.089, 0]);
    addMesh(piece, new THREE.TorusGeometry(0.025, 0.005, 6, segments), mat, [0, 0.107, 0], [Math.PI / 2, 0, 0]);
  } else if (kind === 'king') {
    addMesh(piece, new THREE.CylinderGeometry(0.016, 0.026, 0.06, segments), mat, [0, 0.049, 0]);
    addMesh(piece, new THREE.SphereGeometry(0.021, segments, 8), mat, [0, 0.093, 0]);
    addMesh(piece, new THREE.BoxGeometry(0.008, 0.032, 0.008), mat, [0, 0.12, 0]);
    addMesh(piece, new THREE.BoxGeometry(0.028, 0.008, 0.008), mat, [0, 0.123, 0]);
  } else {
    addMesh(piece, new THREE.CylinderGeometry(0.014, 0.023, 0.039, segments), mat, [0, 0.037, 0]);
    addMesh(piece, new THREE.SphereGeometry(0.019, segments, 8), mat, [0, 0.066, 0]);
  }

  group.add(piece);
}

function addAnalysisBoard(study, towardBoard) {
  const frame = physical(0x2a160d, { roughness: 0.48, clearcoat: 0.3, specularIntensity: 0.36 });
  const brass = physical(0x987038, { metalness: 0.76, roughness: 0.31, clearcoat: 0.22, specularIntensity: 0.58 });
  const light = physical(0xd4c59f, { roughness: 0.6, clearcoat: 0.09, specularIntensity: 0.25 });
  const dark = physical(0x68442c, { roughness: 0.56, clearcoat: 0.13, specularIntensity: 0.29 });

  const boardX = 0;
  const boardZ = 0;
  const square = 0.1;

  const board = addMesh(
    study,
    new THREE.BoxGeometry(0.94, 0.035, 0.94),
    frame,
    [boardX, 1.17, boardZ],
    [0, 0, 0],
    'war-room-command-desk-analysis-board',
  );
  board.userData.commandDeskRole = 'centered-analysis-board';
  board.userData.commandDeskCenterX = 0;
  addMesh(
    study,
    new THREE.BoxGeometry(0.978, 0.018, 0.978),
    brass,
    [boardX, 1.184, boardZ],
    [0, 0, 0],
    'war-room-command-desk-analysis-board-rim',
  );

  const squareGeometry = new THREE.BoxGeometry(square * 0.98, 0.012, square * 0.98);
  const lightSquares = new THREE.InstancedMesh(squareGeometry, light, 32);
  const darkSquares = new THREE.InstancedMesh(squareGeometry.clone(), dark, 32);
  lightSquares.name = 'war-room-command-desk-analysis-light-squares';
  darkSquares.name = 'war-room-command-desk-analysis-dark-squares';
  lightSquares.castShadow = false;
  darkSquares.castShadow = false;
  lightSquares.receiveShadow = true;
  darkSquares.receiveShadow = true;

  const matrix = new THREE.Matrix4();
  let lightIndex = 0;
  let darkIndex = 0;
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const x = boardX + (file - 3.5) * square;
      const z = boardZ + towardBoard * (rank - 3.5) * square;
      matrix.makeTranslation(x, 1.202, z);
      if ((file + rank) % 2 === 0) lightSquares.setMatrixAt(lightIndex++, matrix);
      else darkSquares.setMatrixAt(darkIndex++, matrix);
    }
  }
  lightSquares.instanceMatrix.needsUpdate = true;
  darkSquares.instanceMatrix.needsUpdate = true;
  study.add(lightSquares, darkSquares);

  const squareAt = (file, rank) => ({
    x: boardX + (file - 3.5) * square,
    z: boardZ + towardBoard * (rank - 3.5) * square,
  });
  const backRank = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  for (let file = 0; file < 8; file += 1) {
    addStudyPiece(study, { ...squareAt(file, 0), kind: backRank[file], dark: false });
    addStudyPiece(study, { ...squareAt(file, 1), kind: 'pawn', dark: false });
    addStudyPiece(study, { ...squareAt(file, 6), kind: 'pawn', dark: true });
    addStudyPiece(study, { ...squareAt(file, 7), kind: backRank[file], dark: true });
  }
}

function addReferenceBooks(study, towardBoard) {
  const page = physical(0xd1c49f, { roughness: 0.86, clearcoat: 0.02, specularIntensity: 0.13 });
  const covers = [
    physical(0x5a1e26, { roughness: 0.62, clearcoat: 0.15, specularIntensity: 0.26 }),
    physical(0x1c4937, { roughness: 0.63, clearcoat: 0.14, specularIntensity: 0.25 }),
    physical(0x263b58, { roughness: 0.62, clearcoat: 0.15, specularIntensity: 0.26 }),
    physical(0xb8aa85, { roughness: 0.72, clearcoat: 0.08, specularIntensity: 0.2 }),
  ];
  const brass = physical(0x8f672b, { metalness: 0.7, roughness: 0.34, clearcoat: 0.16, specularIntensity: 0.5 });
  const books = new THREE.Group();
  books.name = 'war-room-command-desk-chess-reference-books';
  books.userData.referenceSubjects = ['aperturas', 'tactica', 'finales', 'partidas-anotadas'];
  books.userData.commandDeskRole = 'left-stacked-reference-books';

  const stackX = -1.08;
  const stackZ = -towardBoard * 0.025;
  const widths = [0.64, 0.6, 0.57, 0.53];
  const depths = [0.37, 0.355, 0.34, 0.325];
  const rotations = [-0.018, 0.026, -0.036, 0.018];
  for (let index = 0; index < 4; index += 1) {
    const y = 1.175 + index * 0.061;
    const volume = addMesh(
      books,
      new THREE.BoxGeometry(widths[index], 0.055, depths[index]),
      covers[index],
      [stackX, y, stackZ],
      [0, rotations[index], 0],
      `war-room-command-desk-reference-volume-${index + 1}`,
    );
    volume.userData.referenceStackIndex = index;
    addMesh(
      books,
      new THREE.BoxGeometry(widths[index] - 0.055, 0.035, depths[index] - 0.026),
      page,
      [stackX, y + 0.002, stackZ],
      [0, rotations[index], 0],
    );
    addMesh(
      books,
      new THREE.BoxGeometry(0.016, 0.058, depths[index] - 0.055),
      brass,
      [stackX - widths[index] * 0.46, y, stackZ],
      [0, rotations[index], 0],
    );
  }

  const emblemY = 1.175 + 3 * 0.061 + 0.033;
  addMesh(
    books,
    new THREE.BoxGeometry(0.085, 0.004, 0.012),
    brass,
    [stackX, emblemY, stackZ],
    [0, rotations[3], 0],
    'war-room-command-desk-reference-emblem-horizontal',
  ).castShadow = false;
  addMesh(
    books,
    new THREE.BoxGeometry(0.012, 0.004, 0.085),
    brass,
    [stackX, emblemY + 0.001, stackZ],
    [0, rotations[3], 0],
    'war-room-command-desk-reference-emblem-vertical',
  ).castShadow = false;

  study.add(books);
}

export function applyWarRoomCommandDeskStudy(root, { coarsePointer = false, towardBoard = 1 } = {}) {
  if (!root || coarsePointer) return 0;
  const desk = root.getObjectByName?.('command-cabinet');
  const art = desk?.getObjectByName?.('war-room-teutonic-command-desk-v28');
  if (!art || art.getObjectByName?.('war-room-command-desk-chess-study')) return 0;

  const study = new THREE.Group();
  study.name = 'war-room-command-desk-chess-study';
  study.userData.warRoomStudyVersion = WAR_ROOM_COMMAND_DESK_STUDY_VERSION;
  study.userData.warRoomStudyPurpose = 'centered-chessboard-with-stacked-reference-books';
  addAnalysisBoard(study, towardBoard);
  addReferenceBooks(study, towardBoard);
  art.add(study);
  desk.userData.warRoomCommandDeskStudy = WAR_ROOM_COMMAND_DESK_STUDY_VERSION;
  return 1;
}

export function installWarRoomCommandDeskStudy(group, {
  towardBoard = 1,
  coarsePointer = false,
} = {}) {
  if (!group || coarsePointer) return 0;
  const changed = applyWarRoomCommandDeskStudy(group, { towardBoard, coarsePointer });
  const registered = registerWarRoomDeferredFinalizer(group, {
    key: WAR_ROOM_COMMAND_DESK_STUDY_VERSION,
    coarsePointer,
    run: (root) => applyWarRoomCommandDeskStudy(root || group, { towardBoard, coarsePointer }),
  });
  return changed + registered;
}
