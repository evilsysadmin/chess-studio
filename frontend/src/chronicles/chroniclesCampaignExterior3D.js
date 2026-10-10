import * as THREE from 'three';
import { createSwordhavenSkyDome, swordhavenGrassTexture } from './chroniclesSwordhaven3D.js';
import { buildChroniclesEnemyVisual } from '../chroniclesEnemyVisualRegistry.js';

// File-authored exterior topology: no independent collision map or invisible
// decorative blockers. Impassable cells alone own boulders/low walls; every
// roadway slab lies flush on an already-walkable authored tile.
const CELL = 4;
const material = (color, opts = {}) => new THREE.MeshStandardMaterial({
  color, roughness: 0.94, metalness: 0.02, ...opts,
});
function gridToWorld(x, y, center) {
  return [(x - center.x) * CELL, (y - center.y) * CELL];
}

function visibleRoadCells(scenePlan, center) {
  const saved = scenePlan?.landscape?.roadCells;
  if (Array.isArray(saved)) return saved.filter(p => p && Number.isInteger(p.x) && Number.isInteger(p.y));
  // Initial candidate manifests intentionally preserve all passable tiles as
  // '.'; until their roadway material mask is promoted from atlas JSON, only
  // the clearly authored north/south and east/west main axes get visual paving.
  const out = [];
  (scenePlan.grid || []).forEach((row, y) => {
    [...row].forEach((tile, x) => {
      if (tile !== '#'
        && (x === center.x || y === center.y)
      ) out.push({ x, y });
    });
  });
  return out;
}

export function buildChroniclesCampaignExterior(scene, { scenePlan = {}, coarsePointer = false } = {}) {
  const grid = scenePlan.grid || [];
  const width = Math.max(1, Number(scenePlan.width) || grid[0]?.length || 19);
  const height = Math.max(1, Number(scenePlan.height) || grid.length || 15);
  const sceneCenter = scenePlan.center || { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  const roadMap = scenePlan.mapId === 'banner-road';
  const forest = scenePlan.mapId === 'rookwood-first-book';
  const earth = material(forest ? 0x8fa178 : 0xffffff, { map: swordhavenGrassTexture() });
  const stone = material(roadMap ? 0x77756c : 0xaba18f);
  const paver = material(roadMap ? 0xb8ab91 : 0xc6bba5);
  const timber = material(0x4d3424);
  const linen = material(0x963f32, { side: THREE.DoubleSide });
  const plaque = material(0xc4aa70, { metalness: 0.47, roughness: 0.45 });

  const skyTint = forest ? 0x9fb8a4 : 0xb4d4df;
  scene.background = new THREE.Color(skyTint);
  scene.fog = forest
    ? new THREE.Fog(skyTint, 14, Math.max(width, height) * CELL * 0.95)
    : new THREE.Fog(skyTint, 55, Math.max(width, height) * CELL * 1.65);
  const sunDirection = new THREE.Vector3(-25, 30, -65).normalize();
  scene.add(createSwordhavenSkyDome(sunDirection));
  scene.add(new THREE.HemisphereLight(0xd4e9ff, 0x60734b, 1.4));
  const sunlight = new THREE.DirectionalLight(0xffe6ba, coarsePointer ? 1.18 : 1.55);
  sunlight.name = 'chronicles-campaign-sun';
  sunlight.position.copy(sunDirection).multiplyScalar(75);
  sunlight.castShadow = !coarsePointer;
  if (!coarsePointer) {
    sunlight.shadow.mapSize.set(512, 512);
    sunlight.shadow.camera.left = -42;
    sunlight.shadow.camera.right = 42;
    sunlight.shadow.camera.top = 42;
    sunlight.shadow.camera.bottom = -42;
  }
  scene.add(sunlight);
  // A forest continues past the playable grid so its gaps never show the void.
  const margin = forest ? FOREST_MARGIN_CELLS * 2 : 0;
  const terrain = new THREE.Mesh(new THREE.BoxGeometry((width + margin) * CELL, 0.25, (height + margin) * CELL), earth);
  terrain.name = 'chronicles-campaign-terrain';
  terrain.position.y = -0.19;
  terrain.receiveShadow = true;
  scene.add(terrain);

  // A forest has no paved axes: its paths are the gaps between trees.
  const roadCells = forest ? [] : visibleRoadCells(scenePlan, sceneCenter).filter(({ x, y }) => grid[y]?.[x] === '.');
  if (roadCells.length) {
    const roads = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL * 0.98, 0.045, CELL * 0.98), paver, roadCells.length);
    const dummy = new THREE.Object3D();
    roadCells.forEach(({ x, y }, index) => {
      const [wx, wz] = gridToWorld(x, y, sceneCenter);
      dummy.position.set(wx, 0.002, wz);
      dummy.updateMatrix();
      roads.setMatrixAt(index, dummy.matrix);
    });
    roads.instanceMatrix.needsUpdate = true;
    roads.name = 'chronicles-campaign-road';
    roads.receiveShadow = true;
    scene.add(roads);
  }

  // Existing '#'-cell collision is visualized as stone embankment (one draw
  // call), not as unmarked floor. Do not scatter blockers on '.' terrain.
  const blocked = [];
  grid.forEach((row, y) => [...row].forEach((tile, x) => {
    if (tile === '#') blocked.push({ x, y });
  }));
  if (blocked.length && forest) {
    const outskirts = [];
    for (let y = -FOREST_MARGIN_CELLS; y < height + FOREST_MARGIN_CELLS; y += 1) {
      for (let x = -FOREST_MARGIN_CELLS; x < width + FOREST_MARGIN_CELLS; x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) outskirts.push({ x, y });
      }
    }
    scene.add(buildForestCanopy([...blocked, ...outskirts], sceneCenter, { coarsePointer }));
  } else if (blocked.length) {
    const barrier = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL * 0.98, 1.6, CELL * 0.98), stone, blocked.length);
    const dummy = new THREE.Object3D();
    blocked.forEach(({ x, y }, i) => {
      const [wx, wz] = gridToWorld(x, y, sceneCenter);
      dummy.position.set(wx, 0.76, wz);
      dummy.updateMatrix();
      barrier.setMatrixAt(i, dummy.matrix);
    });
    barrier.instanceMatrix.needsUpdate = true;
    barrier.name = 'chronicles-campaign-visible-blockers';
    barrier.castShadow = !coarsePointer;
    barrier.receiveShadow = true;
    scene.add(barrier);
  }

  const contentProps = [];
  for (const entry of scenePlan.content || []) {
    if (!entry.position || (entry.kind !== 'exit' && entry.kind !== 'lore')) continue;
    // A second dialogue beat on an existing NPC has no body of its own.
    if (entry.visualType === 'rookwood-mourner-voice') continue;
    const [wx, wz] = gridToWorld(entry.position.x, entry.position.y, sceneCenter);
    const root = new THREE.Group();
    root.name = 'chronicles-campaign-content-' + entry.id;
    root.userData.chroniclesContentId = entry.id;
    root.position.set(wx, 0, wz);
    let activatedRoot = null;
    // Optional authored facing (0 N, 1 E, 2 S, 3 W) for characters and signs.
    const facing = [[0, -1], [1, 0], [0, 1], [-1, 0]][Number(entry.visualFacing)];
    if (facing) root.rotation.y = Math.atan2(facing[0], facing[1]);
    if (entry.visualType === 'name-oak') {
      activatedRoot = buildNameOak(root, { timber, plaque, coarsePointer });
    } else if (entry.visualType === 'name-plaque') {
      buildNamePlaque(root, { timber, plaque });
    } else if (entry.visualType === 'rookwood-mourner') {
      buildMourner(root);
    } else if (entry.kind === 'exit') {
      // Gate posts flank the road, so a gate on the west/east edge turns 90°
      // instead of planting one post straight in front of the arriving camera.
      if (entry.position.x <= 1 || entry.position.x >= width - 2) root.rotation.y = Math.PI / 2;
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 4.4, 8), timber);
        pole.position.set(side * 1.25, 2.2, 0);
        root.add(pole);
        const banner = new THREE.Mesh(new THREE.BoxGeometry(0.67, 1.65, 0.06), linen);
        banner.name = 'banner-road-heraldic-pennant';
        banner.position.set(side * 1.25 + 0.34 * side, 3.18, 0);
        root.add(banner);
      }
    } else {
      const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.64, 1.05, 8), stone);
      marker.position.y = 0.53;
      const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.12), plaque);
      emblem.position.set(0, 0.76, 0.57);
      root.add(marker, emblem);
    }
    root.visible = entry.visible !== false;
    scene.add(root);
    contentProps.push({ id: entry.id, kind: entry.kind, root, activatedRoot, phase: 0 });
  }

  // Overworld enemies are real, visible bodies on their authored cells, with
  // the same model registry and runtime animation contract as dungeons.
  const enemyDefinitions = scenePlan.enemies || [];
  const enemies = {};
  enemyDefinitions.forEach((definition) => {
    const enemy = buildChroniclesEnemyVisual(definition.visualType || definition.id, { coarsePointer })?.model;
    if (!enemy) return;
    const [ex, ez] = gridToWorld(definition.x, definition.y, sceneCenter);
    enemy.position.set(ex, 0, ez);
    const authoredScale = Number(definition.visualScale);
    enemy.scale.setScalar(Number.isFinite(authoredScale) ? authoredScale : 1.08);
    enemy.rotation.y = Math.PI;
    enemy.userData.chroniclesBaseYaw = enemy.rotation.y;
    enemy.userData.chroniclesBaseScale = enemy.scale.x;
    enemy.userData.chroniclesTargetPosition = new THREE.Vector3(ex, 0, ez);
    enemies[definition.id] = enemy;
    scene.add(enemy);
  });

  return {
    enemies, enemyDefinitions,
    spectralChapel: new THREE.Group(),
    sigilMaterial: material(0x99866b),
    gateMaterial: material(0x74614b),
    gateRunes: [], torches: [], contentProps, sceneCenter, materialArt: null,
  };
}

const FOREST_MARGIN_CELLS = 3;

// Deterministic per-cell jitter: the same map always grows the same forest.
function cellNoise(x, y, salt = 0) {
  const n = Math.sin((x * 127.1 + y * 311.7 + salt * 74.7)) * 43758.5453;
  return n - Math.floor(n);
}

// Impassable cells of a forest map are tree clumps, not stone blocks: the
// collision grid stays the single source of truth, only its dressing changes.
function buildForestCanopy(blocked, center, { coarsePointer = false } = {}) {
  const group = new THREE.Group();
  group.name = 'chronicles-campaign-forest';
  const perCell = coarsePointer ? 1 : 2;
  const count = blocked.length * perCell;
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.22, 0.34, 3.2, 7),
    material(0x4a3423),
    count,
  );
  const lower = new THREE.InstancedMesh(new THREE.ConeGeometry(1.75, 3.4, 8), material(0x2f4a2a), count);
  const upper = new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 2.7, 8), material(0x3d5c32), count);
  const dummy = new THREE.Object3D();
  let index = 0;
  blocked.forEach(({ x, y }) => {
    const [wx, wz] = gridToWorld(x, y, center);
    for (let k = 0; k < perCell; k += 1) {
      const ox = (cellNoise(x, y, k) - 0.5) * (perCell > 1 ? 2.2 : 0.8);
      const oz = (cellNoise(y, x, k + 3) - 0.5) * (perCell > 1 ? 2.2 : 0.8);
      const scale = 0.85 + cellNoise(x, y, k + 7) * 0.5;
      const yaw = cellNoise(x, y, k + 11) * Math.PI * 2;
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.setScalar(scale);
      dummy.position.set(wx + ox, 1.6 * scale, wz + oz);
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);
      dummy.position.set(wx + ox, 4.1 * scale, wz + oz);
      dummy.updateMatrix();
      lower.setMatrixAt(index, dummy.matrix);
      dummy.position.set(wx + ox, 5.7 * scale, wz + oz);
      dummy.updateMatrix();
      upper.setMatrixAt(index, dummy.matrix);
      index += 1;
    }
  });
  [trunks, lower, upper].forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = !coarsePointer;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  return group;
}

// The Oak of Names: a broad old tree whose empty cords fill with the
// recovered plaques once the side quest is resolved. Sized so that, seen
// from the adjacent cell, both the cords at eye level and the crown read.
function buildNameOak(root, { timber, plaque, coarsePointer = false }) {
  const bark = material(0x46311f);
  const leaves = material(0x56743a);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.62, 3.3, 10), bark);
  trunk.position.y = 1.65;
  trunk.castShadow = !coarsePointer;
  root.add(trunk);
  const crowns = [[0, 3.9, 0, 1.75], [-1.25, 3.45, 0.45, 1.2], [1.2, 3.55, -0.3, 1.25], [0.15, 3.3, 1.15, 1.05], [-0.2, 3.4, -1.15, 1.05]];
  crowns.forEach(([x, y, z, r]) => {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaves);
    crown.position.set(x, y, z);
    crown.castShadow = !coarsePointer;
    root.add(crown);
  });
  const rootFlare = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, 0.3, 10), timber);
  rootFlare.position.y = 0.15;
  root.add(rootFlare);

  // Three cords ring the trunk so they face the party from any approach.
  const cord = material(0xc9b88c);
  const hung = new THREE.Group();
  hung.name = 'chronicles-name-oak-plaques';
  const glowPlaque = plaque.clone();
  glowPlaque.emissive = new THREE.Color(0x8a5a12);
  glowPlaque.emissiveIntensity = 0.85;
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    const radius = 0.7;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.9, 4), cord);
    string.position.set(x, 2.15, z);
    root.add(string);
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.05), glowPlaque);
    tablet.position.set(x, 1.62, z);
    tablet.rotation.y = angle;
    hung.add(tablet);
  }
  const shine = new THREE.PointLight(0xffd27a, 0.9, 5, 2);
  shine.position.set(0, 1.8, 0);
  hung.add(shine);
  hung.visible = false;
  root.add(hung);
  return hung;
}

function buildNamePlaque(root, { timber, plaque }) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6), timber);
  post.position.y = 0.55;
  post.rotation.z = 0.12;
  const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.32, 0.06), plaque);
  tablet.position.set(0.04, 1.02, 0.08);
  tablet.rotation.z = 0.12;
  const gleam = new THREE.PointLight(0xffd58a, 0.55, 3.2, 2);
  gleam.position.set(0, 1.2, 0.4);
  root.add(post, tablet, gleam);
}

// Edda: a hooded villager holding a lantern, simple and readable at
// distance; the lantern makes her findable in the forest's green dusk.
function buildMourner(root) {
  const cloak = material(0x5b4a35);
  const shawl = material(0x7a2f26);
  const skin = material(0xd8b48f);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.48, 1.35, 12), cloak);
  body.position.y = 0.68;
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), shawl);
  shoulders.scale.set(1.15, 0.55, 0.85);
  shoulders.position.y = 1.36;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), skin);
  head.position.set(0, 1.62, 0.03);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), shawl);
  hood.position.set(0, 1.66, -0.02);
  hood.rotation.x = -0.35;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.55, 8), cloak);
  arm.position.set(0.3, 1.12, 0.12);
  arm.rotation.z = 0.5;
  const frame = material(0x2c2118, { metalness: 0.4, roughness: 0.6 });
  const lantern = new THREE.Group();
  const flame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.1), material(0xffc970, { emissive: 0xff9a2e, emissiveIntensity: 0.75 }));
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 4), frame);
  cap.position.y = 0.11;
  cap.rotation.y = Math.PI / 4;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.15), frame);
  base.position.y = -0.085;
  lantern.add(flame, cap, base);
  lantern.position.set(0.45, 0.82, 0.18);
  const glow = new THREE.PointLight(0xffb45a, 0.9, 4.5, 2);
  glow.position.set(0.45, 0.9, 0.3);
  root.add(body, shoulders, head, hood, arm, lantern, glow);
}
