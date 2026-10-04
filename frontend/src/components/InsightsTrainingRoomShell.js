import * as THREE from 'three';

export const INSIGHTS_TRAINING_ROOM_SCENE_VERSION = 'insights-training-room-v1';

function material(color, metalness = 0.04, roughness = 0.78, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
}

function makeWoodTexture() {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const wave = Math.sin((x * .9) + Math.sin(y * .42) * 1.6);
      const seam = ((y + Math.floor(x / 7)) % 11 === 0) ? -18 : 0;
      const grain = Math.round(wave * 9) + seam;
      data[i] = Math.max(20, 98 + grain);
      data[i + 1] = Math.max(12, 58 + Math.round(grain * .62));
      data[i + 2] = Math.max(8, 34 + Math.round(grain * .42));
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.2, 1.15);
  texture.needsUpdate = true;
  return texture;
}

function addWallPanels(root, wood, brass) {
  const group = new THREE.Group();
  group.name = 'insights-training-room-wall-panels';
  for (const x of [-8.15, -3.75, .05, 3.7, 8.05]) {
    box(group, [.16, 6.25, .34], wood, [x, 2.42, 0], 'wall-pilaster');
    box(group, [.24, .11, .42], brass, [x, 5.48, .03], 'wall-pilaster-cap');
  }
  for (const y of [.72, 5.38]) {
    box(group, [17.1, .12, .34], wood, [0, y, 0], 'wall-panel-rail');
  }
  group.position.set(0, 0, -6.6);
  root.add(group);
}

function addWindowArch(group, brass) {
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(2.15, .085, 8, 40, Math.PI),
    brass,
  );
  arch.position.set(0, 5.72, .11);
  arch.rotation.z = 0;
  arch.name = 'window-arch';
  group.add(arch);

  box(group, [.14, 1.08, .28], brass, [-2.15, 5.28, .06], 'window-arch-left');
  box(group, [.14, 1.08, .28], brass, [2.15, 5.28, .06], 'window-arch-right');
}

function box(root, size, mat, position, name = '') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  mesh.castShadow = /^(desk|chair|bookcase|study-book|lamp|armillary|training-room-mantel|training-room-fireplace)/.test(name);
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
  mesh.castShadow = /^(desk|lamp|armillary)/.test(name);
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
  addWindowArch(group, brass);
  box(group, [.1, 5.45, .22], brass, [0, 2.9, .12], 'window-mullion');
  box(group, [4.15, .1, .22], brass, [0, 2.8, .12], 'window-crossbar');

  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(lite ? .42 : .52, lite ? 18 : 28, lite ? 10 : 16),
    moon,
  );
  moonMesh.position.set(.95, 4.45, .34);
  moonMesh.name = 'training-room-moon';
  group.add(moonMesh);

  const moonGlow = new THREE.Mesh(
    new THREE.SphereGeometry(lite ? .56 : .68, lite ? 14 : 22, lite ? 8 : 12),
    new THREE.MeshBasicMaterial({
      color: 0xaec9ef,
      transparent: true,
      opacity: .075,
      depthWrite: false,
    }),
  );
  moonGlow.position.copy(moonMesh.position);
  moonGlow.name = 'training-room-moon-glow';
  group.add(moonGlow);

  if (!lite) {
    const skyline = [
      [-1.5, .58, .5, 1.55],
      [-.95, .48, .55, 1.1],
      [-.25, .62, .48, 1.85],
      [.5, .42, .55, 1.3],
      [1.25, .5, .5, 1.65],
    ];
    const skylineMat = material(0x07111f, .01, .96);
    for (const [x, w, d, h] of skyline) {
      box(group, [w, h, d], skylineMat, [x, .1 + h / 2, .24], 'window-skyline');
    }
    for (const [x, y, r] of [[-1.5, 1.85, .31], [-.25, 2.08, .34], [1.25, 1.96, .28]]) {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(r, .72, 4), skylineMat);
      roof.position.set(x, y, .24);
      roof.rotation.y = Math.PI / 4;
      roof.name = 'window-castle-spire';
      group.add(roof);
    }
  }

  group.position.set(5.55, .1, -6.25);
  root.add(group);
}

function addChair(root, leather, wood) {
  const group = new THREE.Group();
  group.name = 'insights-training-room-empty-chair';
  box(group, [2.55, .5, 1.55], leather, [0, .72, 0], 'chair-seat');
  const backShape = new THREE.Shape();
  backShape.moveTo(-1.38, -1.48);
  backShape.lineTo(-1.38, .72);
  backShape.quadraticCurveTo(-1.34, 1.52, 0, 1.78);
  backShape.quadraticCurveTo(1.34, 1.52, 1.38, .72);
  backShape.lineTo(1.38, -1.48);
  backShape.closePath();
  const upholsteredBack = new THREE.Mesh(
    new THREE.ExtrudeGeometry(backShape, {
      depth: .34,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: .06,
      bevelThickness: .045,
    }),
    leather,
  );
  upholsteredBack.position.set(0, 2.08, -.76);
  upholsteredBack.castShadow = true;
  upholsteredBack.receiveShadow = true;
  upholsteredBack.name = 'chair-upholstered-back';
  group.add(upholsteredBack);

  const leftWing = box(group, [.42, 2.25, .62], leather, [-1.28, 2.12, -.36], 'chair-left-wing');
  leftWing.rotation.y = -.18;
  const rightWing = box(group, [.42, 2.25, .62], leather, [1.28, 2.12, -.36], 'chair-right-wing');
  rightWing.rotation.y = .18;

  for (const y of [1.35, 2.05, 2.75]) {
    for (const x of [-.82, 0, .82]) {
      const stud = new THREE.Mesh(new THREE.SphereGeometry(.055, 8, 6), wood);
      stud.position.set(x, y, -.31);
      stud.name = 'chair-tuft';
      group.add(stud);
    }
  }
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
  for (const x of [-4.65, -1.55, 1.55, 4.65]) {
    box(group, [2.6, .66, .06], wood, [x, .46, 1.09], 'desk-drawer-front');
    cylinder(group, .055, .07, .09, brass, [x, .48, 1.16], 'desk-drawer-pull', 12).rotation.x = Math.PI / 2;
  }
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

  if (!lite) {
    const quillMat = material(0xd8cfb8, .01, .78);
    const quill = new THREE.Group();
    quill.name = 'desk-quill';

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.014, .022, .9, 8), quillMat);
    shaft.position.y = .28;
    shaft.rotation.z = -.08;
    shaft.castShadow = true;
    quill.add(shaft);

    const feather = new THREE.Mesh(new THREE.ConeGeometry(.14, .72, 10), quillMat);
    feather.scale.x = .52;
    feather.position.set(-.02, .88, 0);
    feather.rotation.z = .1;
    feather.castShadow = true;
    quill.add(feather);

    quill.position.set(3.9, 1.48, .42);
    quill.rotation.z = -.46;
    quill.rotation.x = .12;
    group.add(quill);

    const seal = cylinder(group, .16, .16, .05, material(0x6f1e1b, .04, .52), [1.74, 1.3, .3], 'desk-wax-seal', 16);
    seal.rotation.x = Math.PI / 2;
  }

  group.position.set(0, -.55, -1.05);
  root.add(group);
}

function addBankerLamp(root, brass, glass) {
  const group = new THREE.Group();
  group.name = 'insights-training-room-bankers-lamp';
  cylinder(group, .44, .55, .16, brass, [0, .06, 0], 'lamp-base');
  cylinder(group, .075, .1, 1.45, brass, [0, .84, 0], 'lamp-stem');
  const shade = new THREE.Mesh(new THREE.BoxGeometry(1.7, .4, .78), glass);
  shade.position.set(0, 1.62, 0);
  shade.rotation.z = -.06;
  shade.name = 'lamp-green-shade';
  group.add(shade);
  group.position.set(5.45, .76, -1.42);
  root.add(group);

  const warm = new THREE.PointLight(0xffb665, 1.02, 8.5, 2);
  warm.position.set(5.2, 2.22, -1.1);
  warm.castShadow = false;
  warm.name = 'training-room-desk-lamp-light';
  root.add(warm);

  const poolTarget = new THREE.Object3D();
  poolTarget.position.set(4.45, .6, -.55);
  poolTarget.name = 'training-room-lamp-pool-target';
  root.add(poolTarget);

  const pool = new THREE.SpotLight(0xffbf78, 1.28, 8.5, .5, .68, 1.65);
  pool.position.set(5.28, 2.34, -1.12);
  pool.target = poolTarget;
  pool.castShadow = false;
  pool.name = 'training-room-lamp-pool';
  root.add(pool);
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
  const woodTexture = makeWoodTexture();
  const wood = material(0xffffff, .05, .58, { map: woodTexture });
  const woodDark = material(0x4a2b1e, .03, .72, { map: woodTexture });
  const leather = material(0x4a2d24, .03, .53);
  const stone = material(0x4a4540, .01, .9);
  const brass = material(0xb58d45, .72, .26);
  const parchment = material(0xd6c6a3, .01, .78);
  const bankerGlass = material(0x34785d, .04, .28, {
    transparent: true,
    opacity: .92,
    emissive: 0x174a37,
    emissiveIntensity: .58,
  });
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
  box(root, [19.2, .24, 1.0], wood, [0, 6.12, -6.45], 'training-room-crown-moulding');
  box(root, [19.6, .22, 10.5], woodDark, [0, 6.38, -2.1], 'training-room-ceiling');
  box(root, [19.0, .08, .5], brass, [0, 5.94, -6.38], 'training-room-cornice-inlay');
  addWallPanels(root, wood, brass);

  // A restrained rug and desk rail give the floor/desk a more authored,
  // layered silhouette without adding a second interactive surface.
  box(root, [10.8, .045, 5.4], material(0x381b20, .01, .93), [0, -.53, 1.45], 'training-room-rug');
  box(root, [8.4, .02, 4.2], material(0x211c16, .01, .96), [0, -.5, 1.45], 'training-room-rug-inset');

  addBookcase(root, -5.55, wood, brass, books, lite);
  addWindow(root, brass, night, moon, lite);
  addChair(root, leather, wood);
  addDesk(root, wood, woodDark, leather, brass, parchment, lite);
  addBankerLamp(root, brass, bankerGlass);
  addArmillary(root, brass, lite);

  // Warm left-side hearth keeps the room legible and anchors the canonical
  // amber/cool-moon contrast without introducing a human figure.
  box(root, [2.35, 2.35, .62], stone, [-7.15, .48, -5.7], 'training-room-fireplace');
  box(
    root,
    [1.22, 1.05, .12],
    new THREE.MeshStandardMaterial({
      color: 0x2a1208,
      emissive: 0xff6a22,
      emissiveIntensity: lite ? .55 : .82,
      roughness: .8,
    }),
    [-7.15, .2, -5.34],
    'training-room-hearth',
  );
  box(root, [2.72, .16, .82], wood, [-7.15, 1.72, -5.52], 'training-room-mantel');

  box(root, [2.25, 1.75, .18], wood, [.2, 4.65, -6.72], 'training-room-frame');
  box(root, [1.55, 1.08, .08], brass, [.2, 4.65, -6.54], 'training-room-frame-inlay');

  const warmKey = new THREE.PointLight(0xffa65b, lite ? .72 : 1.08, 13, 2);
  warmKey.position.set(-4.25, 3.0, -2.1);
  warmKey.castShadow = false;
  warmKey.name = 'training-room-warm-key';
  root.add(warmKey);

  const hearthLight = new THREE.PointLight(0xff7b32, lite ? .48 : .78, 8.5, 2);
  hearthLight.position.set(-6.85, 1.35, -4.7);
  hearthLight.castShadow = false;
  hearthLight.name = 'training-room-hearth-light';
  root.add(hearthLight);

  const coolWindow = new THREE.PointLight(0x7aa8e8, lite ? .58 : .84, 15, 2);
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
