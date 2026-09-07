import * as THREE from 'three';
import {
  ensureMatthiasHomeEnvironmentRoot,
  ensureMatthiasHomeInteractionAnchor,
  markMatthiasHomeEnvironmentNode,
  MATTHIAS_HOME_INTERACTION_SCENE_VERSION,
  worldAnchorMatthiasHomeNode,
} from './matthiasHomeInteractionScene.js';

export const MATTHIAS_PRIVATE_GAME_RIG_VERSION = 'private-game-v3-shared-world-anchor';
export { MATTHIAS_HOME_INTERACTION_SCENE_VERSION };

const CLOCKS = new WeakMap();
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const BACK_RANK = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function mesh(parent, geometry, material, {
  name = '',
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
} = {}) {
  const next = new THREE.Mesh(geometry, material);
  next.name = name;
  next.position.set(...position);
  next.rotation.set(...rotation);
  next.scale.set(...scale);
  parent.add(next);
  return next;
}

function pieceHeight(type) {
  if (type === 'king') return .115;
  if (type === 'queen') return .105;
  if (type === 'rook') return .087;
  if (type === 'bishop') return .094;
  if (type === 'knight') return .090;
  return .072;
}

function buildPiece(parent, { type, side, file, rank, x, y, material, accent, moving = false }) {
  const group = new THREE.Group();
  group.name = `private-game-${side}-${type}-${file}${rank}`;
  group.userData.pieceType = type;
  group.userData.side = side;
  group.userData.homePropKind = moving ? 'handheld' : 'environment-child';
  group.userData.homeAttachmentPolicy = moving ? 'explicit-only' : 'never-hand';
  group.position.set(x, y, .043);
  parent.add(group);

  const h = pieceHeight(type);
  const baseRadius = type === 'pawn' ? .025 : .031;
  mesh(group, new THREE.CylinderGeometry(baseRadius * 1.18, baseRadius * 1.28, .018, 12), material, {
    name: `${group.name}-base`,
    position: [0, 0, .010],
    rotation: [Math.PI / 2, 0, 0],
  });
  mesh(group, new THREE.CylinderGeometry(baseRadius * .64, baseRadius * .92, h * .45, 12), material, {
    name: `${group.name}-body`,
    position: [0, 0, .026 + h * .16],
    rotation: [Math.PI / 2, 0, 0],
  });

  if (type === 'pawn') {
    mesh(group, new THREE.SphereGeometry(.025, 10, 8), material, {
      name: `${group.name}-head`,
      position: [0, 0, .064],
    });
  } else if (type === 'rook') {
    mesh(group, new THREE.BoxGeometry(.052, .052, .025), material, {
      name: `${group.name}-crown`,
      position: [0, 0, .078],
    });
  } else if (type === 'knight') {
    mesh(group, new THREE.ConeGeometry(.032, .064, 8), material, {
      name: `${group.name}-head`,
      position: [.008, 0, .078],
      rotation: [0, -.34, Math.PI / 2],
    });
  } else if (type === 'bishop') {
    mesh(group, new THREE.ConeGeometry(.030, .060, 10), material, {
      name: `${group.name}-mitre`,
      position: [0, 0, .083],
      rotation: [Math.PI / 2, 0, 0],
    });
  } else {
    mesh(group, new THREE.SphereGeometry(type === 'king' ? .030 : .028, 10, 8), material, {
      name: `${group.name}-head`,
      position: [0, 0, type === 'king' ? .091 : .086],
    });
    mesh(group, type === 'king'
      ? new THREE.BoxGeometry(.012, .050, .012)
      : new THREE.TorusGeometry(.026, .006, 6, 12), accent, {
      name: `${group.name}-${type === 'king' ? 'cross' : 'crown'}`,
      position: [0, 0, type === 'king' ? .114 : .106],
      rotation: type === 'king' ? [0, 0, 0] : [Math.PI / 2, 0, 0],
    });
    if (type === 'king') {
      mesh(group, new THREE.BoxGeometry(.038, .012, .012), accent, {
        name: `${group.name}-crossbar`,
        position: [0, 0, .120],
      });
    }
  }

  if (moving) group.userData.privateGameMovingPiece = true;
  return group;
}

function buildPrivateGameRig(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig?.root) return null;

  const scene = new THREE.Group();
  scene.name = 'activity-private-game-mock';
  scene.visible = false;
  scene.userData.rigVersion = MATTHIAS_PRIVATE_GAME_RIG_VERSION;
  markMatthiasHomeEnvironmentNode(scene, { interaction: 'chess', stage: 'private-game-table' });
  activityRig.root.add(scene);

  const interactionAnchor = ensureMatthiasHomeInteractionAnchor(scene, {
    name: 'private-game-interaction-anchor',
    interaction: 'chess',
    position: [0, .06, -.02],
    approachRadius: .18,
  });

  const wood = new THREE.MeshStandardMaterial({ color: 0x2b160c, roughness: .48, metalness: .10 });
  const woodEdge = new THREE.MeshStandardMaterial({ color: 0x7b451d, roughness: .34, metalness: .22 });
  const lightSquare = new THREE.MeshStandardMaterial({ color: 0xb88a45, roughness: .62, metalness: .04 });
  const darkSquare = new THREE.MeshStandardMaterial({ color: 0x17120f, roughness: .68, metalness: .06 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd5a94a, roughness: .24, metalness: .72 });
  const goldAccent = new THREE.MeshStandardMaterial({ color: 0xffd77a, roughness: .18, metalness: .86 });
  const black = new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: .22, metalness: .48 });
  const blackAccent = new THREE.MeshStandardMaterial({ color: 0x34373b, roughness: .28, metalness: .62 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe1c58c, roughness: .52, metalness: .02 });
  const uniform = new THREE.MeshStandardMaterial({ color: 0x090b0e, roughness: .30, metalness: .34 });
  const uniformTrim = new THREE.MeshStandardMaterial({ color: 0xb37a28, roughness: .24, metalness: .82 });

  const board = new THREE.Group();
  board.name = 'private-game-board';
  markMatthiasHomeEnvironmentNode(board, { interaction: 'chess', stage: 'private-game-board' });
  board.position.set(0, -.565, .79);
  board.rotation.set(-.62, .015, 0);
  scene.add(board);

  mesh(board, new THREE.BoxGeometry(1.08, .66, .045), wood, {
    name: 'private-game-board-frame',
    position: [0, 0, -.025],
  });
  mesh(board, new THREE.BoxGeometry(1.02, .60, .018), woodEdge, {
    name: 'private-game-board-gold-edge',
    position: [0, 0, .002],
  });

  const squareW = .118;
  const squareH = .069;
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      mesh(board, new THREE.BoxGeometry(squareW * .98, squareH * .98, .012), (row + column) % 2 ? darkSquare : lightSquare, {
        name: 'private-game-square',
        position: [(column - 3.5) * squareW, (row - 3.5) * squareH, .020],
      });
    }
  }

  const pieces = [];
  let movingPiece = null;
  const coordinate = (column, row) => [
    (column - 3.5) * squareW,
    (row - 3.5) * squareH,
  ];

  for (let column = 0; column < 8; column += 1) {
    const [wx, wy] = coordinate(column, 0);
    pieces.push(buildPiece(board, {
      type: BACK_RANK[column], side: 'white', file: FILES[column], rank: 1,
      x: wx, y: wy, material: gold, accent: goldAccent,
    }));
    const whitePawnRow = column === 4 ? 3 : 1;
    const [wpx, wpy] = coordinate(column, whitePawnRow);
    const whitePawn = buildPiece(board, {
      type: 'pawn', side: 'white', file: FILES[column], rank: column === 4 ? 4 : 2,
      x: wpx, y: wpy, material: gold, accent: goldAccent, moving: column === 4,
    });
    pieces.push(whitePawn);
    if (column === 4) movingPiece = whitePawn;

    const blackPawnRow = column === 4 ? 4 : 6;
    const [bpx, bpy] = coordinate(column, blackPawnRow);
    pieces.push(buildPiece(board, {
      type: 'pawn', side: 'black', file: FILES[column], rank: column === 4 ? 5 : 7,
      x: bpx, y: bpy, material: black, accent: blackAccent,
    }));
    const [bx, by] = coordinate(column, 7);
    pieces.push(buildPiece(board, {
      type: BACK_RANK[column], side: 'black', file: FILES[column], rank: 8,
      x: bx, y: by, material: black, accent: blackAccent,
    }));
  }

  const actorScene = new THREE.Group();
  actorScene.name = 'activity-private-game-actor';
  actorScene.visible = false;
  actorScene.userData.relationship = 'actor-choreography';
  activityRig.root.add(actorScene);

  const handPivot = new THREE.Group();
  handPivot.name = 'private-game-moving-hand';
  handPivot.position.set(.17, -.28, .84);
  actorScene.add(handPivot);
  mesh(handPivot, new THREE.CapsuleGeometry(.080, .34, 5, 10), uniform, {
    name: 'private-game-uniform-sleeve',
    position: [.17, .055, -.18],
    rotation: [1.03, 0, -.38],
  });
  mesh(handPivot, new THREE.TorusGeometry(.082, .011, 6, 16), uniformTrim, {
    name: 'private-game-sleeve-gold-cuff',
    position: [.065, -.045, -.005],
    rotation: [Math.PI / 2, 0, -.16],
  });
  mesh(handPivot, new THREE.SphereGeometry(.090, 14, 10), skin, {
    name: 'private-game-hand',
    position: [0, -.105, .055],
    scale: [1.06, .78, .88],
  });
  mesh(handPivot, new THREE.CapsuleGeometry(.027, .14, 5, 10), skin, {
    name: 'private-game-pointing-finger',
    position: [-.020, -.185, .080],
    rotation: [1.08, 0, -.08],
  });

  const environmentRoot = worldAnchorMatthiasHomeNode(rig, scene);
  activityRig.privateGame = scene;
  activityRig.privateGameEnvironmentRoot = environmentRoot;
  activityRig.privateGameInteractionAnchor = interactionAnchor;
  activityRig.privateGameActor = actorScene;
  activityRig.privateGameBoard = board;
  activityRig.privateGamePieces = pieces;
  activityRig.privateGameMovingPiece = movingPiece;
  activityRig.privateGameHand = handPivot;
  rig.root.userData.activityPrivateGameRigVersion = MATTHIAS_PRIVATE_GAME_RIG_VERSION;
  rig.root.userData.activityPrivateGameInteractionScene = MATTHIAS_HOME_INTERACTION_SCENE_VERSION;
  return scene;
}

function ensurePrivateGameRig(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return null;
  if (activityRig.privateGame?.userData?.rigVersion === MATTHIAS_PRIVATE_GAME_RIG_VERSION) {
    ensureMatthiasHomeEnvironmentRoot(rig);
    return activityRig.privateGame;
  }
  activityRig.privateGame?.removeFromParent?.();
  activityRig.privateGameActor?.removeFromParent?.();
  return buildPrivateGameRig(rig);
}

function elapsedSeconds(rig, pose, active) {
  const explicit = Number(pose?.activityTime);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  if (!active) {
    CLOCKS.delete(rig);
    return 0;
  }
  const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() / 1000
    : Date.now() / 1000;
  const startedAt = CLOCKS.get(rig);
  if (!Number.isFinite(startedAt)) {
    CLOCKS.set(rig, now);
    return 0;
  }
  return Math.max(0, now - startedAt);
}

export function matthiasPrivateGameMotionState(activityTime = 0, { reducedMotion = false } = {}) {
  if (reducedMotion) return { reach: .52, lift: .12, slide: .10 };
  const cycle = Math.max(0, Number(activityTime) || 0) % 9;
  if (cycle < 2.4) return { reach: .30, lift: 0, slide: 0 };
  if (cycle < 3.7) {
    const t = smoothstep((cycle - 2.4) / 1.3);
    return { reach: .30 + t * .50, lift: t * .55, slide: 0 };
  }
  if (cycle < 4.8) {
    const t = smoothstep((cycle - 3.7) / 1.1);
    return { reach: .80, lift: .55 + t * .25, slide: t };
  }
  if (cycle < 6.3) {
    const t = smoothstep((cycle - 4.8) / 1.5);
    return { reach: .80 - t * .50, lift: .80 * (1 - t), slide: 1 };
  }
  return { reach: .30, lift: 0, slide: 1 };
}

export function applyMatthiasHomePrivateGameRig(rig, pose = {}) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return null;
  const scene = ensurePrivateGameRig(rig);
  if (!scene) return null;

  scene.visible = true;
  if (activityRig.privateGameActor) activityRig.privateGameActor.visible = true;
  if (activityRig.chess) activityRig.chess.visible = false;
  if (activityRig.support) activityRig.support.visible = false;
  if (activityRig.assist) activityRig.assist.visible = false;

  const time = elapsedSeconds(rig, pose, true);
  const motion = matthiasPrivateGameMotionState(time, { reducedMotion: Boolean(pose.activityReducedMotion) });
  const hand = activityRig.privateGameHand;
  if (hand) {
    hand.position.x = .17 - motion.reach * .12;
    hand.position.y = -.28 - motion.reach * .10;
    hand.position.z = .84 + motion.reach * .20;
    hand.rotation.z = -.04 - motion.reach * .06;
  }
  const movingPiece = activityRig.privateGameMovingPiece;
  if (movingPiece) {
    const baseX = (4 - 3.5) * .118;
    movingPiece.position.x = baseX - motion.slide * .118;
    movingPiece.position.z = .043 + motion.lift * .055;
  }
  if (activityRig.privateGameBoard) {
    activityRig.privateGameBoard.rotation.z = Math.sin(time * .42) * .0025;
  }

  rig.root.userData.activityPrivateGameComposition = MATTHIAS_PRIVATE_GAME_RIG_VERSION;
  rig.root.userData.activityPrivateGameReach = motion.reach;
  rig.root.userData.activityPrivateGameRelationship = 'world-anchored-environment';
  rig.root.userData.activityPrivateGameAnchor = 'private-game-interaction-anchor';
  return scene;
}

export function clearMatthiasHomePrivateGameRig(rig) {
  const activityRig = rig?.activityRig;
  if (activityRig?.privateGame) activityRig.privateGame.visible = false;
  if (activityRig?.privateGameActor) activityRig.privateGameActor.visible = false;
  CLOCKS.delete(rig);
  if (rig?.root?.userData) {
    rig.root.userData.activityPrivateGameComposition = 'inactive';
    rig.root.userData.activityPrivateGameReach = 0;
    rig.root.userData.activityPrivateGameRelationship = 'inactive';
    rig.root.userData.activityPrivateGameAnchor = 'inactive';
  }
}
