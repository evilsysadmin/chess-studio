import * as THREE from 'three';
import {
  applyMatthiasPawnPose,
  createMatthiasPawn3D,
  disposeMatthiasPawn3D,
  MATTHIAS_PAWN_EMBLEM,
} from './MatthiasPawn3D.js';

export const MATTHIAS_PREMIUM_HOME_MODEL_VERSION = 'matthias-home-premium-3d-v1';
export const MATTHIAS_PREMIUM_HOME_FACE_RIG_VERSION = 'premium-pawn-face-v1';
export const MATTHIAS_PREMIUM_HOME_FIDELITY_VERSION = 'approved-original-premium-v1';
export const MATTHIAS_PREMIUM_HOME_RENDER_CONTRACT = 'canonical-pawn-3d-v1';
export const MATTHIAS_PREMIUM_HOME_REFERENCE = 'approved-original-matthias-premium-v1';
export const MATTHIAS_PREMIUM_HOME_CAP_VERSION = 'officer-cap-v4-peaked-canonical';
export const MATTHIAS_PREMIUM_HOME_ACTIVITY_RIG_VERSION = 'activity-props-v4-premium-routines';
export const MATTHIAS_PREMIUM_HOME_ACTIVITY_COMPOSITION_VERSION = 'portrait-readable-v5-premium-routines';
export const MATTHIAS_PREMIUM_HOME_FRAME_SCALE = .94;
export const MATTHIAS_PREMIUM_HOME_FRAME_Y = -.05;
export { MATTHIAS_PAWN_EMBLEM };

const ACTIVITY_PROPS = Object.freeze({
  sip: 'cup',
  beer: 'beer',
  breakfast: 'breakfast',
  bite: 'ration',
  read: 'book',
  dossier: 'dossier',
  write: 'write',
  think: 'chess',
  sleep: 'blanket',
});

function node(root, name) {
  return root?.getObjectByName?.(name) || null;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function setMaterial(nodeRef, {
  color,
  roughness,
  metalness,
  clearcoat,
} = {}) {
  const material = nodeRef?.material;
  if (!material) return;
  if (color != null && material.color?.setHex) material.color.setHex(color);
  if (roughness != null && 'roughness' in material) material.roughness = roughness;
  if (metalness != null && 'metalness' in material) material.metalness = metalness;
  if (clearcoat != null && 'clearcoat' in material) material.clearcoat = clearcoat;
  material.needsUpdate = true;
}

function activityMaterial(color, {
  metalness = .45,
  roughness = .30,
  clearcoat = .28,
} = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness,
    roughness,
    clearcoat,
    clearcoatRoughness: .2,
  });
}

function activityMesh(parent, geometry, material, {
  name,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
} = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name || '';
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function sleepBlanketGeometry(compact) {
  const shape = new THREE.Shape();
  shape.moveTo(-.56, .29);
  shape.quadraticCurveTo(-.63, .18, -.57, .045);
  shape.lineTo(-.49, -.30);
  shape.quadraticCurveTo(-.28, -.38, 0, -.35);
  shape.quadraticCurveTo(.28, -.38, .49, -.30);
  shape.lineTo(.57, .045);
  shape.quadraticCurveTo(.63, .18, .56, .29);
  shape.quadraticCurveTo(.24, .245, 0, .205);
  shape.quadraticCurveTo(-.24, .245, -.56, .29);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: .085,
    curveSegments: compact ? 4 : 8,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: compact ? 1 : 2,
    bevelSize: .024,
    bevelThickness: .018,
  });
  geometry.center();
  return geometry;
}

function buildActivityRig(rig, compact) {
  const activityRoot = new THREE.Group();
  activityRoot.name = 'home-activity-rig';
  activityRoot.position.set(0, -.06, .02);
  rig.root.add(activityRoot);

  const black = activityMaterial(0x101318, { metalness: .60, roughness: .24, clearcoat: .55 });
  const plate = activityMaterial(0x343941, { metalness: .52, roughness: .28, clearcoat: .36 });
  const gold = activityMaterial(0xd09b37, { metalness: 1, roughness: .17, clearcoat: .30 });
  const ivory = activityMaterial(0xe0c28d, { metalness: .02, roughness: .36, clearcoat: .18 });
  const paper = activityMaterial(0xc7baa2, { metalness: 0, roughness: .64, clearcoat: .02 });
  const red = activityMaterial(0x6f211d, { metalness: .22, roughness: .34, clearcoat: .30 });
  const food = activityMaterial(0xa86b31, { metalness: 0, roughness: .72, clearcoat: .02 });
  const filling = activityMaterial(0x682b20, { metalness: 0, roughness: .76, clearcoat: .01 });
  const ink = activityMaterial(0x25211c, { metalness: 0, roughness: .72, clearcoat: .01 });
  const wood = activityMaterial(0x3a2117, { metalness: .08, roughness: .58, clearcoat: .14 });
  const woodLight = activityMaterial(0xa78251, { metalness: .04, roughness: .48, clearcoat: .12 });
  const cloth = activityMaterial(0x4a201d, { metalness: 0, roughness: .86, clearcoat: 0 });
  const clothFold = activityMaterial(0x6a302a, { metalness: 0, roughness: .90, clearcoat: 0 });
  const pillowCloth = activityMaterial(0xbda47c, { metalness: 0, roughness: .88, clearcoat: 0 });
  const foam = activityMaterial(0xf0ddbb, { metalness: 0, roughness: .62, clearcoat: .06 });
  const beerGlass = new THREE.MeshPhysicalMaterial({
    color: 0xa96319,
    metalness: .02,
    roughness: .18,
    clearcoat: .58,
    clearcoatRoughness: .12,
    transparent: true,
    opacity: .82,
  });
  const steam = new THREE.MeshBasicMaterial({
    color: 0xf8ead7,
    transparent: true,
    opacity: .34,
    depthWrite: false,
  });

  // Arms are deliberately tiny and prop-driven. Matthias remains a pawn; the
  // limbs exist only long enough to make cups/books/dossiers feel physically held.
  const support = new THREE.Group();
  support.name = 'activity-support';
  activityRoot.add(support);
  const supportStem = activityMesh(
    support,
    new THREE.CapsuleGeometry(.055, .37, compact ? 3 : 5, compact ? 8 : 12),
    black,
    { name: 'activity-support-stem', position: [.38, -.28, .48], rotation: [1.08, 0, -.48] },
  );
  const supportGlove = activityMesh(
    support,
    new THREE.SphereGeometry(.09, compact ? 12 : 18, compact ? 9 : 14),
    black,
    { name: 'activity-support-glove', position: [.49, -.05, .68], scale: [1.05, .76, .9] },
  );

  const assist = new THREE.Group();
  assist.name = 'activity-assist';
  activityRoot.add(assist);
  const assistStem = activityMesh(
    assist,
    new THREE.CapsuleGeometry(.052, .34, compact ? 3 : 5, compact ? 8 : 12),
    black,
    { name: 'activity-assist-stem', position: [-.38, -.30, .47], rotation: [1.08, 0, .48] },
  );
  const assistGlove = activityMesh(
    assist,
    new THREE.SphereGeometry(.085, compact ? 12 : 18, compact ? 9 : 14),
    black,
    { name: 'activity-assist-glove', position: [-.47, -.09, .67], scale: [1.03, .74, .88] },
  );

  // Campaign coffee: a real cup silhouette, dark liquid, saucer and two restrained
  // steam wisps. The details are intentionally chunky enough to survive 128 px.
  const cup = new THREE.Group();
  cup.name = 'activity-cup';
  activityRoot.add(cup);
  activityMesh(cup, new THREE.CylinderGeometry(.13, .115, .22, compact ? 18 : 28), ivory, {
    name: 'campaign-cup-body', position: [0, 0, 0],
  });
  activityMesh(cup, new THREE.TorusGeometry(.126, .012, 7, compact ? 18 : 28), gold, {
    name: 'campaign-cup-rim', position: [0, .11, 0], rotation: [Math.PI / 2, 0, 0],
  });
  const cupHandle = activityMesh(cup, new THREE.TorusGeometry(.085, .018, 7, compact ? 16 : 24, Math.PI * 1.58), gold, {
    name: 'campaign-cup-handle', position: [.13, .005, 0], rotation: [0, Math.PI / 2, -.32],
  });
  cupHandle.scale.y = .92;
  activityMesh(cup, new THREE.CylinderGeometry(.105, .105, .012, compact ? 16 : 24), ink, {
    name: 'campaign-cup-coffee', position: [0, .106, 0],
  });
  activityMesh(cup, new THREE.CylinderGeometry(.18, .18, .018, compact ? 18 : 28), ivory, {
    name: 'campaign-cup-saucer', position: [0, -.128, -.012], scale: [1, .65, 1],
  });
  for (const [index, x] of [[0, -.035], [1, .035]]) {
    const steamCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, .15, .012),
      new THREE.Vector3(x + (index ? -.018 : .018), .235, .018),
      new THREE.Vector3(x + (index ? .016 : -.016), .315, .008),
      new THREE.Vector3(x, .39, 0),
    ]);
    activityMesh(cup, new THREE.TubeGeometry(steamCurve, compact ? 8 : 14, .009, 5, false), steam, {
      name: 'campaign-cup-steam',
    });
  }

  // Beer gets its own object instead of masquerading as coffee: translucent amber
  // stein, gold rim/handle and oversized foam readable at portrait scale.
  const beer = new THREE.Group();
  beer.name = 'activity-beer';
  activityRoot.add(beer);
  activityMesh(beer, new THREE.CylinderGeometry(.145, .12, .28, compact ? 18 : 28), beerGlass, {
    name: 'campaign-beer-body',
  });
  activityMesh(beer, new THREE.TorusGeometry(.142, .013, 7, compact ? 18 : 28), gold, {
    name: 'campaign-beer-rim', position: [0, .14, 0], rotation: [Math.PI / 2, 0, 0],
  });
  const beerHandle = activityMesh(beer, new THREE.TorusGeometry(.10, .022, 7, compact ? 16 : 24, Math.PI * 1.58), gold, {
    name: 'campaign-beer-handle', position: [.15, .005, 0], rotation: [0, Math.PI / 2, -.28],
  });
  beerHandle.scale.y = 1.12;
  for (const [x, y, scale] of [[-.055, .155, .9], [0, .17, 1.08], [.058, .155, .92]]) {
    activityMesh(beer, new THREE.SphereGeometry(.065, compact ? 10 : 16, compact ? 8 : 12), foam, {
      name: 'campaign-beer-foam', position: [x, y, .012], scale: [scale, .58, .82],
    });
  }

  // Breakfast is a deliberate composition: cup on one side, croissant/plate and
  // folded Chess Weekly on the other. No more generic ration standing in for it.
  const breakfastTray = new THREE.Group();
  breakfastTray.name = 'activity-breakfast';
  activityRoot.add(breakfastTray);
  activityMesh(breakfastTray, new THREE.CylinderGeometry(.23, .23, .026, compact ? 18 : 28), plate, {
    name: 'breakfast-plate', rotation: [Math.PI / 2, 0, 0],
  });
  activityMesh(breakfastTray, new THREE.TorusGeometry(.12, .042, 8, compact ? 18 : 28, Math.PI * 1.36), food, {
    name: 'breakfast-croissant', position: [-.015, .02, .045], rotation: [0, 0, -.28],
  });
  const newspaper = new THREE.Group();
  newspaper.name = 'breakfast-newspaper';
  newspaper.position.set(.24, .055, .06);
  newspaper.rotation.z = -.12;
  breakfastTray.add(newspaper);
  activityMesh(newspaper, new THREE.BoxGeometry(.18, .25, .016), paper, {
    name: 'breakfast-newspaper-left', position: [-.085, 0, 0], rotation: [0, .08, .02],
  });
  activityMesh(newspaper, new THREE.BoxGeometry(.18, .25, .016), paper, {
    name: 'breakfast-newspaper-right', position: [.085, 0, 0], rotation: [0, -.08, -.02],
  });
  for (const [x, y, width] of [[-.085, .065, .115], [-.085, .015, .12], [.085, .058, .11], [.085, .005, .12]]) {
    activityMesh(newspaper, new THREE.BoxGeometry(width, .014, .010), ink, {
      name: 'breakfast-newspaper-line', position: [x, y, .014],
    });
  }

  // Lunch/cena: a recognisable bocata with two bread halves and filling on a
  // metal plate. Keep the old ration naming for compatibility with saved tests.
  const ration = new THREE.Group();
  ration.name = 'activity-ration';
  ration.scale.setScalar(1.10);
  activityRoot.add(ration);
  activityMesh(ration, new THREE.CylinderGeometry(.26, .26, .032, compact ? 18 : 30), plate, {
    name: 'ration-plate', rotation: [Math.PI / 2, 0, 0],
  });
  activityMesh(ration, new THREE.TorusGeometry(.255, .013, 7, compact ? 18 : 30), gold, {
    name: 'ration-plate-rim', position: [0, 0, .018],
  });
  activityMesh(ration, new THREE.CapsuleGeometry(.07, .24, compact ? 3 : 5, compact ? 10 : 16), ivory, {
    name: 'ration-bread-bottom', position: [.04, -.045, .055], rotation: [0, 0, Math.PI / 2], scale: [1, 1, .72],
  });
  activityMesh(ration, new THREE.BoxGeometry(.30, .045, .13), filling, {
    name: 'ration-filling', position: [.04, .02, .068], rotation: [0, 0, -.03],
  });
  activityMesh(ration, new THREE.CapsuleGeometry(.075, .25, compact ? 3 : 5, compact ? 10 : 16), food, {
    name: 'ration-bread', position: [.04, .082, .074], rotation: [0, 0, Math.PI / 2 - .03], scale: [1, 1, .74],
  });
  activityMesh(ration, new THREE.BoxGeometry(.055, .022, .24), gold, {
    name: 'ration-cutlery', position: [-.225, .052, .045], rotation: [0, .08, -.18],
  });

  // Strategy book: readable spread, central crease, page edge and bookmark.
  const book = new THREE.Group();
  book.name = 'activity-book';
  activityRoot.add(book);
  activityMesh(book, new THREE.BoxGeometry(.32, .30, .035), paper, {
    name: 'book-pages-left', position: [-.15, 0, .035], rotation: [0, .26, .055],
  });
  activityMesh(book, new THREE.BoxGeometry(.32, .30, .035), paper, {
    name: 'book-pages-right', position: [.15, 0, .035], rotation: [0, -.26, -.055],
  });
  activityMesh(book, new THREE.BoxGeometry(.34, .32, .018), red, {
    name: 'book-cover-left', position: [-.17, -.006, -.012], rotation: [0, .30, .055],
  });
  activityMesh(book, new THREE.BoxGeometry(.34, .32, .018), red, {
    name: 'book-cover-right', position: [.17, -.006, -.012], rotation: [0, -.30, -.055],
  });
  activityMesh(book, new THREE.CylinderGeometry(.014, .014, .34, 10), gold, {
    name: 'book-spine', position: [0, 0, .05],
  });
  activityMesh(book, new THREE.CylinderGeometry(.007, .007, .29, 8), ink, {
    name: 'book-page-crease', position: [0, .005, .073],
  });
  activityMesh(book, new THREE.BoxGeometry(.028, .19, .012), gold, {
    name: 'book-bookmark', position: [.105, -.205, .048], rotation: [0, 0, -.055],
  });

  // Dossier: layered paper, tab, brass clip and visible report lines. It must read
  // as an expediente, not just a red rectangle.
  const dossier = new THREE.Group();
  dossier.name = 'activity-dossier';
  activityRoot.add(dossier);
  activityMesh(dossier, new THREE.BoxGeometry(.56, .34, .035), red, {
    name: 'dossier-folder', rotation: [-.08, .02, .02],
  });
  activityMesh(dossier, new THREE.BoxGeometry(.47, .26, .018), paper, {
    name: 'dossier-paper', position: [0, .015, .028], rotation: [-.08, .02, .02],
  });
  activityMesh(dossier, new THREE.BoxGeometry(.16, .025, .025), gold, {
    name: 'dossier-classified-bar', position: [0, .035, .052], rotation: [-.08, .02, .02],
  });
  activityMesh(dossier, new THREE.BoxGeometry(.16, .055, .028), red, {
    name: 'dossier-tab', position: [-.17, .185, .018], rotation: [-.08, .02, .02],
  });
  activityMesh(dossier, new THREE.BoxGeometry(.045, .11, .018), gold, {
    name: 'dossier-clip', position: [.19, .105, .058], rotation: [-.08, .02, .02],
  });
  for (const [y, width] of [[.075, .25], [.018, .30], [-.04, .27]]) {
    activityMesh(dossier, new THREE.BoxGeometry(width, .012, .010), ink, {
      name: 'dossier-report-line', position: [-.035, y, .061], rotation: [-.08, .02, .02],
    });
  }

  // Writing uses the dossier language, but the gold pen and ink strokes create a
  // distinct action silhouette instead of just reusing the reading pose.
  const write = new THREE.Group();
  write.name = 'activity-write';
  activityRoot.add(write);
  const writingPad = dossier.clone(true);
  writingPad.name = 'writing-dossier';
  write.add(writingPad);
  const penPivot = new THREE.Group();
  penPivot.name = 'activity-pen-pivot';
  write.add(penPivot);
  activityMesh(penPivot, new THREE.CylinderGeometry(.012, .012, .36, 10), gold, {
    name: 'activity-pen', position: [.11, .08, .08], rotation: [0, 0, -.72],
  });
  activityMesh(write, new THREE.BoxGeometry(.16, .012, .010), ink, {
    name: 'writing-signature-line', position: [.02, -.08, .074], rotation: [-.08, .02, .02],
  });

  // Chess-inception finally gets a chess set. Light board base + 32 dark squares
  // gives an actual 8x8 read with half the mesh count of a naive 64-square board.
  const chess = new THREE.Group();
  chess.name = 'activity-chess';
  activityRoot.add(chess);
  activityMesh(chess, new THREE.BoxGeometry(.66, .46, .045), wood, {
    name: 'analysis-board-frame', position: [0, 0, 0],
  });
  activityMesh(chess, new THREE.BoxGeometry(.60, .40, .028), woodLight, {
    name: 'analysis-board-light-field', position: [0, 0, .034],
  });
  const squareW = .075;
  const squareH = .050;
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      if ((row + column) % 2 === 0) continue;
      activityMesh(chess, new THREE.BoxGeometry(squareW * .96, squareH * .96, .012), wood, {
        name: 'analysis-board-dark-square',
        position: [(column - 3.5) * squareW, (row - 3.5) * squareH, .055],
      });
    }
  }
  const addAnalysisPiece = (name, x, y, material, scale = 1) => {
    const piece = new THREE.Group();
    piece.name = name;
    piece.position.set(x, y, .078);
    piece.scale.setScalar(scale);
    chess.add(piece);
    activityMesh(piece, new THREE.CylinderGeometry(.024, .032, .065, compact ? 8 : 12), material, {
      name: 'analysis-piece-body', position: [0, 0, .008], rotation: [Math.PI / 2, 0, 0],
    });
    activityMesh(piece, new THREE.SphereGeometry(.027, compact ? 8 : 12, compact ? 6 : 10), material, {
      name: 'analysis-piece-head', position: [0, .038, .014],
    });
  };
  addAnalysisPiece('analysis-white-king', -.19, -.10, ivory, 1.18);
  addAnalysisPiece('analysis-white-pawn', -.04, -.05, ivory, .88);
  addAnalysisPiece('analysis-white-pawn-2', .12, -.10, ivory, .88);
  addAnalysisPiece('analysis-black-king', .18, .10, black, 1.18);
  addAnalysisPiece('analysis-black-pawn', .035, .055, black, .88);
  addAnalysisPiece('analysis-black-pawn-2', -.12, .11, black, .88);

  // Sleep must read as cloth wrapped around a dozing pawn, not a red dossier
  // parked in front of him. The curved extruded silhouette, top sag and folds
  // remain legible even in the small Home portrait.
  const blanket = new THREE.Group();
  blanket.name = 'activity-blanket';
  activityRoot.add(blanket);
  activityMesh(blanket, sleepBlanketGeometry(compact), cloth, {
    name: 'sleep-blanket-body', position: [0, 0, 0], rotation: [-.055, 0, 0],
  });
  const blanketTrimCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.52, .245, .065),
    new THREE.Vector3(-.26, .218, .083),
    new THREE.Vector3(0, .185, .09),
    new THREE.Vector3(.26, .218, .083),
    new THREE.Vector3(.52, .245, .065),
  ]);
  activityMesh(blanket, new THREE.TubeGeometry(blanketTrimCurve, compact ? 12 : 22, .013, 7, false), gold, {
    name: 'sleep-blanket-trim',
  });
  for (const x of [-.28, 0, .28]) {
    const foldCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, .145, .071),
      new THREE.Vector3(x * .94, -.035, .087),
      new THREE.Vector3(x * .86, -.245, .068),
    ]);
    activityMesh(blanket, new THREE.TubeGeometry(foldCurve, compact ? 8 : 14, .010, 6, false), clothFold, {
      name: 'sleep-blanket-fold',
    });
  }
  activityMesh(blanket, new THREE.CapsuleGeometry(.13, .34, compact ? 3 : 5, compact ? 10 : 16), pillowCloth, {
    name: 'sleep-pillow',
    position: [.29, .405, -.20],
    rotation: [0, 0, Math.PI / 2 - .10],
    scale: [1.22, .82, .62],
  });

  for (const group of [cup, beer, breakfastTray, ration, book, dossier, write, chess, blanket, support, assist]) {
    group.visible = false;
  }

  const activityRig = {
    root: activityRoot,
    support,
    supportStem,
    supportGlove,
    assist,
    assistStem,
    assistGlove,
    cup,
    beer,
    breakfast: breakfastTray,
    ration,
    book,
    dossier,
    write,
    chess,
    blanket,
    penPivot,
    currentProp: 'none',
  };
  rig.activityRig = activityRig;
  rig.root.userData.activityRigVersion = MATTHIAS_PREMIUM_HOME_ACTIVITY_RIG_VERSION;
  rig.root.userData.activityCompositionVersion = MATTHIAS_PREMIUM_HOME_ACTIVITY_COMPOSITION_VERSION;
  rig.root.userData.activityProp = 'none';
  return activityRig;
}

export function matthiasPremiumHomeActivityProp(profile = '') {
  return ACTIVITY_PROPS[String(profile || '').trim().toLowerCase()] || 'none';
}

function effectiveActivityReach(profile, pose) {
  const direct = clamp01(pose?.reach);
  if (profile === 'read') return Math.max(.16, Math.min(.30, .18 + Math.abs(Number(pose?.headYaw) || 0) * .65));
  if (profile === 'dossier') return Math.max(.20, Math.min(.34, .23 + Math.abs(Number(pose?.headYaw) || 0) * .55));
  if (profile === 'write') return Math.max(.28, Math.min(.44, .31 + Math.abs(Number(pose?.headYaw) || 0) * .80));
  if (profile === 'think') return Math.max(.16, Math.min(.28, .17 + Math.abs(Number(pose?.headYaw) || 0) * .30));
  return direct;
}

function applyActivityPose(rig, pose) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return;
  const profile = String(pose?.activityProfile || '').trim().toLowerCase();
  const prop = matthiasPremiumHomeActivityProp(profile);
  const reach = effectiveActivityReach(profile, pose);
  const {
    cup,
    beer,
    breakfast: breakfastTray,
    ration,
    book,
    dossier,
    write,
    chess,
    blanket,
    support,
    supportStem,
    supportGlove,
    assist,
    assistStem,
    assistGlove,
    penPivot,
  } = activityRig;
  const breakfast = prop === 'breakfast';
  const twoHands = breakfast || prop === 'ration' || prop === 'book' || prop === 'dossier' || prop === 'write';

  cup.visible = prop === 'cup' || breakfast;
  beer.visible = prop === 'beer';
  breakfastTray.visible = breakfast;
  ration.visible = prop === 'ration';
  book.visible = prop === 'book';
  dossier.visible = prop === 'dossier';
  write.visible = prop === 'write';
  chess.visible = prop === 'chess';
  blanket.visible = prop === 'blanket';
  support.visible = prop !== 'none' && prop !== 'blanket';
  assist.visible = twoHands;

  if (breakfast) {
    cup.position.set(-.40, -.43 + reach * .18, .80 + reach * .02);
    cup.rotation.set(.02 + reach * .08, .08, .08);
    breakfastTray.position.set(.31, -.57 + reach * .06, .78);
    breakfastTray.rotation.set(-.08, -.08, -.04);
  } else if (prop === 'cup') {
    cup.position.set(.56 - reach * .26, -.26 + reach * .55, .78 + reach * .05);
    cup.rotation.set(.03 + reach * .16, -.08, -.10 - reach * .08);
  } else if (prop === 'beer') {
    beer.position.set(.55 - reach * .22, -.29 + reach * .48, .79 + reach * .04);
    beer.rotation.set(.02 + reach * .11, -.07, -.08 - reach * .05);
  } else if (prop === 'ration') {
    ration.position.set(.58 - reach * .12, -.56 + reach * .16, .80 + reach * .04);
    ration.rotation.set(-.08 + reach * .10, -.12, -.10);
  } else if (prop === 'book') {
    book.position.set(-.10, -.50 + reach * .10, .82);
    book.rotation.set(-.34 + reach * .06, Number(pose?.headYaw || 0) * .12, .035);
  } else if (prop === 'dossier') {
    dossier.position.set(.13, -.49 + reach * .08, .83);
    dossier.rotation.set(-.28 + reach * .06, Number(pose?.headYaw || 0) * .10, -.055);
  } else if (prop === 'write') {
    write.position.set(.12, -.50 + reach * .07, .84);
    write.rotation.set(-.27, Number(pose?.headYaw || 0) * .09, -.045);
    const scribble = Number(pose?.headYaw) || 0;
    penPivot.rotation.z = -.08 + Math.sin(scribble * 18) * .11;
    penPivot.position.x = scribble * .42;
    penPivot.position.y = Math.abs(scribble) * .15;
  } else if (prop === 'chess') {
    chess.position.set(.05, -.55 + reach * .06, .83);
    chess.rotation.set(-.29, Number(pose?.headYaw || 0) * .08, .025);
  } else if (prop === 'blanket') {
    blanket.position.set(0, -.47, .64);
    blanket.rotation.set(-.035, 0, Number(pose?.headRoll || 0) * .10);
  }

  if (support.visible) {
    const documentProp = prop === 'book' || prop === 'dossier' || prop === 'write';
    if (breakfast) {
      supportStem.position.set(.40, -.46 + reach * .06, .48);
      supportStem.rotation.z = -.54;
      supportGlove.position.set(.46, -.34 + reach * .08, .72);
    } else if (prop === 'ration') {
      supportStem.position.set(.43, -.42 + reach * .12, .50);
      supportStem.rotation.z = -.52;
      supportGlove.position.set(.50, -.29 + reach * .14, .74);
    } else if (prop === 'chess') {
      supportStem.position.set(.39, -.35 + reach * .06, .49);
      supportStem.rotation.z = -.61;
      supportGlove.position.set(.38, -.24 + reach * .08, .76);
    } else {
      supportStem.position.x = documentProp ? .39 : .42 - reach * .07;
      supportStem.position.y = documentProp ? -.30 + reach * .08 : -.30 + reach * .29;
      supportStem.rotation.z = documentProp ? -.58 : -.50 - reach * .15;
      supportGlove.position.x = documentProp ? .43 : .54 - reach * .15;
      supportGlove.position.y = documentProp ? -.20 + reach * .10 : -.09 + reach * .30;
      supportGlove.position.z = .72 + reach * .03;
    }
  }

  if (assist.visible) {
    const documentProp = prop === 'book' || prop === 'dossier' || prop === 'write';
    if (breakfast) {
      assistStem.position.set(-.36, -.36 + reach * .10, .47);
      assistStem.rotation.z = .52;
      assistGlove.position.set(-.40, -.24 + reach * .12, .70);
    } else if (prop === 'ration') {
      assistStem.position.set(-.34, -.43 + reach * .10, .48);
      assistStem.rotation.z = .50;
      assistGlove.position.set(-.38, -.31 + reach * .12, .71);
    } else if (documentProp) {
      assistStem.position.set(-.37, -.31 + reach * .07, .47);
      assistStem.rotation.z = .58;
      assistGlove.position.set(-.42, -.21 + reach * .09, .71);
    }
  }

  activityRig.currentProp = prop;
  rig.root.userData.activityProp = prop;
  rig.root.userData.activityReach = reach;
}

function refreshBase(rig) {
  rig.base.leftEyeX = rig.leftEye.position.x;
  rig.base.rightEyeX = rig.rightEye.position.x;
  rig.base.leftBrowY = rig.leftBrow.position.y;
  rig.base.rightBrowY = rig.rightBrow.position.y;
  rig.base.leftBrowRz = rig.leftBrow.rotation.z;
  rig.base.rightBrowRz = rig.rightBrow.rotation.z;
  rig.base.mouthY = rig.mouthGroup.position.y;
}

function refineOfficerCap(root) {
  const crown = node(root, 'cap-crown');
  const top = node(root, 'cap-top');
  const topPiping = node(root, 'cap-top-piping');
  const visor = node(root, 'cap-curved-visor');
  const visorTrim = node(root, 'cap-visor-gold-trim');
  const cord = node(root, 'cap-braided-cord');
  const badge = node(root, 'cap-pawn-emblem');

  // The Home cap must read as a compact peaked officer cap, not a flat platter.
  // Keep the overall footprint smaller than v3, build a little crown height,
  // taper the top plate and expose enough visor surface to read at ~128 px.
  if (crown) {
    crown.scale.x = .98;
    crown.scale.y = 1.20;
    crown.position.y = .982;
  }
  if (top) {
    top.scale.x = .96;
    top.position.y = 1.112;
  }
  if (topPiping) {
    topPiping.scale.x = .96;
    topPiping.position.y = 1.084;
  }
  if (visor) {
    visor.position.set(0, .735, .345);
    visor.rotation.x = Math.PI / 2 - .22;
    visor.scale.set(.98, 1, 1.05);
  }
  if (visorTrim) {
    visorTrim.position.y = -.012;
    visorTrim.position.z = .012;
    visorTrim.scale.x = .98;
    visorTrim.scale.z = 1.01;
  }
  if (cord) {
    cord.position.y = -.008;
    cord.scale.x = .98;
  }
  if (badge) {
    badge.position.y = .955;
    badge.position.z = .535;
    badge.scale.setScalar(.40);
  }
}

export function createMatthiasPremiumHome3D({ compact = false } = {}) {
  const rig = createMatthiasPawn3D({ compact });
  const { root, head, cap, body } = rig;

  // Approved Matthias proportions: cap wider than the head, compact cream ball,
  // large simple black eyes and a heavy pawn body. No human jaw/eyelid anatomy.
  head.position.y = .395;
  head.scale.set(.935, .915, .92);

  rig.leftEye.position.set(-.178, .405, .548);
  rig.rightEye.position.set(.178, .405, .548);
  rig.leftEye.scale.set(.84, 1.52, .42);
  rig.rightEye.scale.set(.84, 1.52, .42);

  const leftGlint = node(root, 'eye-left-glint');
  const rightGlint = node(root, 'eye-right-glint');
  if (leftGlint) leftGlint.visible = false;
  if (rightGlint) rightGlint.visible = false;

  rig.leftBrow.position.set(-.18, .575, .555);
  rig.rightBrow.position.set(.18, .575, .555);
  rig.leftBrow.scale.set(1.14, 1.14, 1.06);
  rig.rightBrow.scale.set(1.14, 1.14, 1.06);
  rig.leftBrow.rotation.z = Math.PI / 2 - .42;
  rig.rightBrow.rotation.z = Math.PI / 2 + .42;

  rig.mouthGroup.position.set(0, .19, .565);
  rig.mouthGroup.scale.set(.96, .96, .96);
  rig.speechMouth.position.set(0, .18, .558);

  cap.scale.set(1.00, 1.04, 1.00);
  cap.position.y = -.055;
  refineOfficerCap(root);
  body.scale.set(1.035, 1.01, 1.035);
  rig.emblem.scale.setScalar(.98);

  const neck = node(root, 'neck-ring');
  if (neck) neck.scale.set(1.08, 1, 1.08);

  setMaterial(head, {
    color: 0xe8c990,
    roughness: .34,
    metalness: .01,
    clearcoat: .18,
  });
  setMaterial(node(root, 'premium-coat-body'), {
    color: 0x0b0d10,
    roughness: .24,
    metalness: .50,
    clearcoat: .62,
  });
  setMaterial(node(root, 'cap-red-band'), {
    color: 0x78241d,
    roughness: .31,
    metalness: .24,
    clearcoat: .36,
  });
  setMaterial(node(root, 'cap-top-piping'), {
    color: 0xc99637,
    roughness: .18,
    metalness: 1,
  });

  buildActivityRig(rig, compact);

  root.name = MATTHIAS_PREMIUM_HOME_MODEL_VERSION;
  root.userData.modelVersion = MATTHIAS_PREMIUM_HOME_MODEL_VERSION;
  root.userData.faceRigVersion = MATTHIAS_PREMIUM_HOME_FACE_RIG_VERSION;
  root.userData.fidelityVersion = MATTHIAS_PREMIUM_HOME_FIDELITY_VERSION;
  root.userData.renderContract = MATTHIAS_PREMIUM_HOME_RENDER_CONTRACT;
  root.userData.approvedReference = MATTHIAS_PREMIUM_HOME_REFERENCE;
  root.userData.capVersion = MATTHIAS_PREMIUM_HOME_CAP_VERSION;
  root.userData.activityRigVersion = MATTHIAS_PREMIUM_HOME_ACTIVITY_RIG_VERSION;
  root.userData.activityCompositionVersion = MATTHIAS_PREMIUM_HOME_ACTIVITY_COMPOSITION_VERSION;
  root.userData.emblem = MATTHIAS_PAWN_EMBLEM;
  root.userData.frameScale = MATTHIAS_PREMIUM_HOME_FRAME_SCALE;
  root.userData.frameY = MATTHIAS_PREMIUM_HOME_FRAME_Y;

  refreshBase(rig);
  return rig;
}

export function applyMatthiasPremiumHomePose(rig, pose) {
  if (!rig || !pose) return;
  applyMatthiasPawnPose(rig, pose);
  applyActivityPose(rig, pose);

  const sleeping = String(pose.activityProfile || '').trim().toLowerCase() === 'sleep';

  // Canonical Matthias keeps large eyes while awake. Sleep is deliberately the
  // one exception: a nearly-flat eye silhouette plus a slumped head must read as
  // genuinely asleep even in the 128 px Home portrait.
  const blink = clamp01(pose.blink);
  const eyeScaleY = sleeping ? .14 : 1.52 * (1 - blink * .18);
  rig.leftEye.scale.set(.84, eyeScaleY, .42);
  rig.rightEye.scale.set(.84, eyeScaleY, .42);

  if (sleeping) {
    rig.root.rotation.z = -.085;
    rig.headPivot.rotation.x += .15;
    rig.headPivot.rotation.z -= .12;
    rig.headPivot.position.y -= .025;
  } else {
    rig.root.rotation.z = 0;
  }

  if (rig.speechMouth.visible) {
    const mouthOpen = clamp01(pose.mouthOpen);
    rig.speechMouth.scale.y = .15 + mouthOpen * .35;
    rig.speechMouth.scale.x = 1.18 + mouthOpen * .10;
    rig.speechMouth.scale.z = .43;
  }

  // Fixed Home framing: keep the wide officer cap inside the portrait safe area.
  // The constants never animate, so FSM gestures cannot introduce zoom or Z drift.
  const sleepDrop = sleeping ? -.035 : 0;
  rig.root.position.y = (Number(pose.bodyY) || 0) + MATTHIAS_PREMIUM_HOME_FRAME_Y + sleepDrop;
  rig.root.position.z = 0;
  rig.root.scale.setScalar(MATTHIAS_PREMIUM_HOME_FRAME_SCALE);
}

export function disposeMatthiasPremiumHome3D(rig) {
  disposeMatthiasPawn3D(rig);
}
