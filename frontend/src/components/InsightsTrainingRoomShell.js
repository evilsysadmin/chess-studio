import * as THREE from 'three';

export const INSIGHTS_TRAINING_ROOM_SCENE_VERSION = 'insights-training-room-v1';

function material(color, metalness = 0.04, roughness = 0.78, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
}

function box(root, size, mat, position, name = '') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = name;
  root.add(mesh);
  return mesh;
}

function cylinder(root, radiusTop, radiusBottom, height, mat, position, name = '', radialSegments = 24) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
    mat,
  );
  mesh.position.set(...position);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = name;
  root.add(mesh);
  return mesh;
}

function addBookcase(root, x, wood, brass, books, lite) {
  const group = new THREE.Group();
  group.name = 'insights-training-room-bookcase';
  box(group, [3.0, 5.5, .46], wood, [0, 2.3, 0], 'bookcase-back');
  const shelves = lite ? 4 : 6;
  for (let row = 0; row < shelves; row += 1) {
    const y = .36 + row * .86;
    box(group, [3.15, .1, .68], wood, [0, y, .08], 'bookcase-shelf');
    const count = lite ? 4 : 6;
    for (let i = 0; i < count; i += 1) {
      const h = .42 + ((row + i) % 3) * .09;
      box(
        group,
        [.22 + ((row + i) % 2) * .04, h, .34],
        books[(row + i) % books.length],
        [-1.08 + i * (lite ? .68 : .42), y + h / 2 + .09, .2],
        'study-book',
      );
    }
  }
  box(group, [3.3, .13, .76], brass, [0, 5.25, .08], 'bookcase-cornice');
  group.position.set(x, 0, -6.45);
  root.add(group);
}

function addWindow(root, brass, night, moon, lite) {
  const group = new THREE.Group();
  group.name = 'insights-training-room-window';

  box(group, [4.2, 5.6, .18], night, [0, 2.9, 0], 'window-night');
  box(group, [.12, 5.8, .28], brass, [-2.15, 2.9, .06], 'window-left');
  box(group, [.12, 5.8, .28], brass, [2.15, 2.9, .06], 'window-right');
  box(group, [4.42, .12, .28], brass, [0, .02, .06], 'window-bottom');
  box(group, [4.42, .12, .28], brass, [0, 5.78, .06], 'window-top');
  box(group, [.1, 5.45, .22], brass, [0, 2.9, .12], 'window-mullion');
  box(group, [4.15, .1, .22], brass, [0, 2.8, .12], 'window-crossbar');

  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(lite ? .58 : .72, lite ? 18 : 28, lite ? 10 : 16),
    moon,
  );
  moonMesh.position.set(.85, 4.35, .32);
  moonMesh.name = 'training-room-moon';
  group.add(moonMesh);

  if (!lite) {
    const skyline = [
      [-1.5, .58, .5, 1.55],
      [-.95, .48, .55, 1.1],
      [-.25, .62, .48, 1.85],
      [.5, .42, .55, 1.3],
      [1.25, .5, .5, 1.65],
    ];
    for (const [x, w, d, h] of skyline) {
      box(group, [w, h, d], material(0x07111f, .01, .96), [x, .1 + h / 2, .24], 'window-skyline');
    }
  }

  group.position.set(5.55, .1, -6.25);
  root.add(group);
}

function addChair(root, leather, wood) {
  const group = new THREE.Group();
  group.name = 'insights-training-room-empty-chair';
  box(group, [2.55, .5, 1.55], leather, [0, .72, 0], 'chair-seat');
  box(group, [2.8, 3.25, .42], leather, [0, 2.25, -.56], 'chair-back');
  box(group, [.32, 2.9, .5], wood, [-1.48, 2.08, -.56], 'chair-left-post');
  box(group, [.32, 2.9, .5], wood, [1.48, 2.08, -.56], 'chair-right-post');
  box(group, [.28, 1.1, .28], wood, [-1.15, -.03, .48], 'chair-left-leg');
  box(group, [.28, 1.1, .28], wood, [1.15, -.03, .48], 'chair-right-leg');
  group.position.set(.55, -.08, -3.95);
  root.add(group);
}

function addDesk(root, wood, woodDark, leather, brass, parchment, lite) {
  const group = new THREE.Group();
  group.name = 'insights-training-room-desk';

  box(group, [14.2, .34, 3.2], wood, [0, 1.0, 0], 'desk-top');
  box(group, [13.4, 1.15, .22], woodDark, [0, .42, .95], 'desk-front');
  for (const x of [-6.25, 6.25]) {
    box(group, [.32, 1.6, .32], woodDark, [x, .18, -.95], 'desk-leg');
    box(group, [.32, 1.6, .32], woodDark, [x, .18, .95], 'desk-leg');
  }
  box(group, [7.3, .08, 1.35], leather, [-.2, 1.2, .15], 'desk-blotter');
  box(group, [5.8, .035, 1.0], parchment, [-.45, 1.255, .14], 'desk-dossier');

  for (const [x, z, s] of [[4.7, -.45, 1], [5.0, -.15, .92], [5.25, .15, .84]]) {
    box(group, [1.7 * s, .18, .76], leather, [x, 1.22 + (1 - s) * .4, z], 'desk-book-stack');
  }

  cylinder(group, .34, .42, .56, brass, [-5.05, 1.48, -.45], 'desk-knight-plinth');
  const studyPiece = new THREE.Mesh(
    new THREE.ConeGeometry(.42, 1.05, lite ? 12 : 20),
    brass,
  );
  studyPiece.position.set(-5.05, 2.05, -.45);
  studyPiece.name = 'desk-chess-study';
  group.add(studyPiece);

  const inkwell = cylinder(group, .22, .28, .42, material(0x111315, .45, .36), [3.7, 1.43, .45], 'desk-inkwell');
  inkwell.rotation.z = .04;

  group.position.set(0, -.55, -1.05);
  root.add(group);
}

function addBankerLamp(root, brass, glass) {
  const group = new THREE.Group();
  group.name = 'insights-training-room-bankers-lamp';
  cylinder(group, .44, .55, .16, brass, [0, .06, 0], 'lamp-base');
  cylinder(group, .075, .1, 1.45, brass, [0, .84, 0], 'lamp-stem');
  const shade = new THREE.Mesh(new THREE.BoxGeometry(1.55, .36, .7), glass);
  shade.position.set(0, 1.62, 0);
  shade.rotation.z = -.06;
  shade.name = 'lamp-green-shade';
  group.add(shade);
  group.position.set(5.45, .76, -1.42);
  root.add(group);

  const warm = new THREE.PointLight(0xffb665, .88, 7.5, 2);
  warm.position.set(5.2, 2.22, -1.1);
  warm.castShadow = false;
  warm.name = 'training-room-desk-lamp-light';
  root.add(warm);
}

function addArmillary(root, brass, lite) {
  const group = new THREE.Group();
  group.name = 'insights-training-room-armillary';
  const radius = lite ? .62 : .78;
  for (const rotation of [
    [Math.PI / 2, 0, 0],
    [Math.PI / 4, Math.PI / 3, 0],
    [Math.PI / 3, -Math.PI / 4, Math.PI / 5],
  ]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, .035, lite ? 8 : 12, lite ? 24 : 36),
      brass,
    );
    ring.rotation.set(...rotation);
    ring.castShadow = false;
    group.add(ring);
  }
  cylinder(group, .12, .18, .8, brass, [0, -.58, 0], 'armillary-stand');
  group.position.set(3.55, 2.0, -2.75);
  root.add(group);
}

export function buildInsightsTrainingRoomLayer({ coarsePointer = false } = {}) {
  const root = new THREE.Group();
  root.name = 'insights-training-room-layer';
  root.userData.sceneVersion = INSIGHTS_TRAINING_ROOM_SCENE_VERSION;
  root.userData.canonical = true;
  root.userData.noHumanFigures = true;

  const lite = Boolean(coarsePointer);
  const wood = material(0x2d190f, .05, .67);
  const woodDark = material(0x160d09, .03, .82);
  const leather = material(0x211411, .02, .6);
  const stone = material(0x3a3632, .01, .94);
  const brass = material(0xa77a2d, .72, .28);
  const parchment = material(0xd6c6a3, .01, .78);
  const bankerGlass = material(0x173d2f, .05, .34, { transparent: true, opacity: .88 });
  const night = new THREE.MeshBasicMaterial({ color: 0x0b1a2d });
  const moon = new THREE.MeshStandardMaterial({
    color: 0xfff0c9,
    emissive: 0xd5d9df,
    emissiveIntensity: .55,
    roughness: .85,
  });
  const books = [
    material(0x4a2118),
    material(0x1e3441),
    material(0x5a4624),
    material(0x2e241b),
    material(0x3f1920),
  ];

  box(root, [20, .32, 20], stone, [0, -.72, -1.0], 'training-room-floor');
  box(root, [18.8, 7.3, .34], woodDark, [0, 2.65, -7.05], 'training-room-back-wall');
  box(root, [18.5, 1.35, .28], wood, [0, .18, -6.82], 'training-room-wainscot');

  addBookcase(root, -5.55, wood, brass, books, lite);
  addWindow(root, brass, night, moon, lite);
  addChair(root, leather, wood);
  addDesk(root, wood, woodDark, leather, brass, parchment, lite);
  addBankerLamp(root, brass, bankerGlass);
  addArmillary(root, brass, lite);

  box(root, [2.25, 1.75, .18], wood, [.2, 4.65, -6.72], 'training-room-frame');
  box(root, [1.55, 1.08, .08], brass, [.2, 4.65, -6.54], 'training-room-frame-inlay');

  const warmKey = new THREE.PointLight(0xffa65b, lite ? .52 : .78, 12, 2);
  warmKey.position.set(-4.25, 3.0, -2.1);
  warmKey.castShadow = false;
  warmKey.name = 'training-room-warm-key';
  root.add(warmKey);

  const coolWindow = new THREE.PointLight(0x7aa8e8, lite ? .42 : .64, 14, 2);
  coolWindow.position.set(5.8, 4.5, -4.8);
  coolWindow.castShadow = false;
  coolWindow.name = 'training-room-moon-key';
  root.add(coolWindow);

  return root;
}

export function disposeInsightsTrainingRoomLayer(root) {
  root?.traverse?.((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const mat of materials) {
      for (const value of Object.values(mat)) {
        if (value?.isTexture) value.dispose?.();
      }
      mat.dispose?.();
    }
  });
}
