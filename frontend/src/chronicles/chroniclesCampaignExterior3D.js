import * as THREE from 'three';
import {
  addSwordhavenClouds, buildSwordhavenFountain, buildSwordhavenHouse, buildSwordhavenTree, createSwordhavenMaterials,
  createSwordhavenSkyDome, swordhavenGrassTexture, swordhavenSurfaceTexture,
} from './chroniclesSwordhaven3D.js';
import { chroniclesPixelTexture } from './chroniclesPixelTextures.js';
import { buildChroniclesEnemyVisual } from '../chroniclesEnemyVisualRegistry.js';
import { buildChroniclesSpriteBillboard } from './chroniclesSpriteBillboards.js';

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
  const forest = scenePlan.mapId === 'rookwood-first-book' || scenePlan.biome === 'forest';
  // Terra biomes tint ground, rock and sky; collision is always the grid.
  const biome = TERRA_BIOMES[scenePlan.biome] || null;
  // Authored towns (First Book Swordhaven) dress their interior blocks as the
  // same half-timbered houses as the legacy square; collision stays the grid.
  const settlement = scenePlan.regionKind === 'settlement';
  const village = settlement ? createSwordhavenMaterials() : null;
  const earth = material(biome?.ground ?? (forest ? 0xaebc9e : 0xffffff), { map: biome?.texture ? terraGroundTexture(biome.texture) : swordhavenGrassTexture() });
  const stone = village ? village.stone
    : material(biome?.rock ?? (roadMap ? 0x8f8a7e : 0xb9b09f), { map: swordhavenSurfaceTexture('masonry') });
  // Roads are pixel-art cobbles: one 64-px tile per 4 m cell.
  const paver = material(roadMap ? 0xcabfa6 : 0xddd3bf, { map: swordhavenSurfaceTexture('cobble') });
  const timber = material(0x4d3424);
  const linen = material(0x963f32, { side: THREE.DoubleSide });
  const plaque = material(0xc4aa70, { metalness: 0.47, roughness: 0.45 });

  const skyTint = biome?.sky ?? (forest ? 0x9fb8a4 : 0xb4d4df);
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
  let blocked = [];
  grid.forEach((row, y) => [...row].forEach((tile, x) => {
    if (tile === '#') blocked.push({ x, y });
  }));
  if (village) {
    const town = new THREE.Group();
    town.name = 'chronicles-campaign-town';
    const houses = settlementHouseBlocks(grid, width, height);
    const houseCells = new Set();
    const contentAt = new Map((scenePlan.content || [])
      .filter(entry => entry.position && String(entry.visualType || '').startsWith('building-'))
      .map(entry => [entry.position.x + ',' + entry.position.y, entry.visualType.slice('building-'.length)]));
    let homeIndex = 0;
    houses.forEach((block, index) => {
      block.cells.forEach(({ x, y }) => houseCells.add(x + ',' + y));
      const facing = settlementHouseFacing(block, grid, sceneCenter);
      const door = facing.door;
      const styleId = contentAt.get(door.x + ',' + door.y);
      const style = TOWN_BUILDING_STYLES[styleId] || TOWN_HOME_STYLES[homeIndex++ % TOWN_HOME_STYLES.length];
      const { root } = buildSwordhavenHouse(
        { id: 'first-book-' + (styleId || 'home') + '-' + index, x: block.cx, y: block.cy, roof: style.roof, emblem: style.emblem },
        village, coarsePointer, new Set(), sceneCenter,
      );
      root.rotation.y = facing.yaw;
      town.add(root);
    });
    // A lone interior blocker is the town fountain, which fits one 4×4 m cell.
    blocked.forEach(({ x, y }) => {
      if (x <= 0 || y <= 0 || x >= width - 1 || y >= height - 1 || houseCells.has(x + ',' + y)) return;
      const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => grid[y + dy]?.[x + dx] === '#');
      if (neighbours.length) return;
      const fountain = buildSwordhavenFountain(village);
      const [wx, wz] = gridToWorld(x, y, sceneCenter);
      fountain.position.set(wx, 0, wz);
      town.add(fountain);
      houseCells.add(x + ',' + y);
    });
    blocked = blocked.filter(({ x, y }) => !houseCells.has(x + ',' + y));
    // Trees stand outside the town wall so no walkable cell gains a blocker.
    TOWN_TREE_CELLS(width, height).forEach(([x, y], index) => {
      const [wx, wz] = gridToWorld(x, y, sceneCenter);
      buildSwordhavenTree(town, wx, wz, village, coarsePointer, index);
    });
    addSwordhavenClouds(town, coarsePointer);
    scene.add(town);
  }
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
    if (!entry.position || !['exit', 'lore', 'pickup'].includes(entry.kind)) continue;
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
      // 2.5D painted billboard; the procedural figure stays as fallback.
      const billboard = buildChroniclesSpriteBillboard('rookwood-mourner');
      if (billboard) {
        root.add(billboard);
        root.userData.updateChroniclesSprite = billboard.userData.updateChroniclesSprite;
      } else {
        buildMourner(root);
      }
    } else if (entry.visualType === 'sewer-grate') {
      // A town's dungeon mouth: iron grate in a stone ring, flush with the road.
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.12, 12), stone);
      ring.position.y = 0.06;
      root.add(ring);
      const iron = material(0x2b2b30, { metalness: 0.6, roughness: 0.55 });
      for (let bar = -3; bar <= 3; bar += 1) {
        const rod = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.5), iron);
        rod.position.set(bar * 0.22, 0.14, 0);
        root.add(rod);
      }
      const cross = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.1), iron);
      cross.position.y = 0.16;
      root.add(cross);
    } else if (entry.visualType === 'dungeon-arch') {
      // A dungeon mouth in the open: two pillars, a lintel and the dark inside.
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.1, 0.55), stone);
        pillar.position.set(side * 1.15, 1.55, 0);
        root.add(pillar);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.5, 0.65), stone);
      lintel.position.y = 3.3;
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.0), material(0x050403, { side: THREE.DoubleSide }));
      dark.position.set(0, 1.5, 0);
      root.add(lintel, dark);
    } else if (entry.visualType === 'chest') {
      const chest = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.7), timber);
      chest.position.y = 0.3;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.22, 0.74), timber);
      lid.position.y = 0.71;
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.1, 0.76), plaque);
      band.position.y = 0.6;
      root.add(chest, lid, band);
    } else if (entry.visualType === 'signpost') {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.2, 6), timber);
      post.position.y = 1.1;
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.42, 0.08), timber);
      board.position.set(0.35, 1.85, 0);
      board.rotation.z = -0.06;
      root.add(post, board);
    } else if (entry.visualType === 'frozen-beacon') {
      // One recognisable, authored lighthouse in F1, not a roadside lamp.
      // The whole silhouette fits a single authored walkable cell: the
      // collision grid stays untouched and all light comes from world flags.
      const frostStone = material(0xb5c5c9, {
        map: swordhavenSurfaceTexture('masonry'), roughness: 0.93,
      });
      const coldSlate = material(0x344657, { roughness: 0.87 });
      const darkMetal = material(0x23303d, { metalness: 0.57, roughness: 0.46 });
      const weatheredBronze = material(0xb79b65, { metalness: 0.47, roughness: 0.43 });
      const addCylinder = (top, bottom, height, y, finish, segments = 12) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), finish);
        mesh.position.y = y;
        root.add(mesh);
        return mesh;
      };
      // Battered foundation, tapered stone tower and its three weather-beaten
      // bands provide a tall silhouette and clear scale even at six tiles.
      addCylinder(1.31, 1.45, 0.8, 0.4, coldSlate);
      addCylinder(0.91, 1.2, 6.8, 3.79, frostStone);
      addCylinder(1.19, 1.24, 0.27, 1.18, coldSlate);
      addCylinder(1.07, 1.12, 0.22, 3.63, coldSlate);
      addCylinder(0.98, 1.03, 0.23, 6.68, coldSlate);
      // A door towards the approaching company and two narrow arrow-slit
      // windows: they make this a building rather than a stack of cylinders.
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.58, 0.74), darkMetal);
      door.position.set(-1.24, 0.87, 0);
      root.add(door);
      for (const y of [3.04, 5.35]) {
        const window = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.28), darkMetal);
        window.position.set(-1.05 + (y > 4 ? 0.09 : 0), y, 0);
        root.add(window);
      }
      // Lantern gallery: bronze deck, upright cage, coloured glass and a
      // broad slate roof. The top is high enough to read on both mobile/PC.
      addCylinder(1.45, 1.25, 0.3, 7.34, weatheredBronze);
      addCylinder(1.55, 1.55, 0.12, 7.57, coldSlate);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.45, 12),
        material(0x6e96a9, { transparent: true, opacity: 0.72,
          emissive: 0x101f2a, emissiveIntensity: 0.2 }));
      glass.position.y = 8.38;
      root.add(glass);
      for (let index = 0; index < 8; index += 1) {
        const angle = (index * Math.PI) / 4;
        const upright = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.55, 6), darkMetal);
        upright.position.set(Math.cos(angle) * 1.09, 8.37, Math.sin(angle) * 1.09);
        root.add(upright);
      }
      addCylinder(1.38, 1.13, 0.19, 9.2, weatheredBronze);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.63, 0.95, 12), coldSlate);
      roof.position.y = 9.72;
      root.add(roof);
      addCylinder(0.12, 0.15, 0.43, 10.39, weatheredBronze, 8);
      // The visible light is a child of the existing activatedRoot contract,
      // so it automatically follows the saved choice without introducing a
      // second light state or animation clock.
      activatedRoot = new THREE.Group();
      activatedRoot.name = 'chronicles-f1-beacon-lit';
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.78, 12, 10),
        material(0xffefb0, { emissive: 0xffbc52, emissiveIntensity: 1.6 }));
      lamp.position.y = 8.4;
      const halo = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10),
        material(0xfedc80, { transparent: true, opacity: 0.28,
          emissive: 0xffc867, emissiveIntensity: 0.5, depthWrite: false }));
      halo.position.y = 8.4;
      // Procedural soft bloom: a small alpha texture keeps the distant
      // lantern readable on mobile without an opaque square or fake collider.
      const flareSize = 48;
      const flarePixels = new Uint8Array(flareSize * flareSize * 4);
      for (let py = 0; py < flareSize; py += 1) {
        for (let px = 0; px < flareSize; px += 1) {
          const dx = (px + 0.5 - flareSize / 2) / (flareSize / 2);
          const dy = (py + 0.5 - flareSize / 2) / (flareSize / 2);
          const radius = Math.sqrt(dx * dx + dy * dy);
          const alpha = Math.pow(Math.max(0, 1 - radius), 1.45);
          const i = (py * flareSize + px) * 4;
          flarePixels[i] = 255;
          flarePixels[i + 1] = 214;
          flarePixels[i + 2] = 140;
          flarePixels[i + 3] = Math.round(alpha * 237);
        }
      }
      const texture = new THREE.DataTexture(flarePixels, flareSize, flareSize, THREE.RGBAFormat);
      texture.needsUpdate = true;
      const flare = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false,
      }));
      flare.name = 'chronicles-f1-beacon-distance-bloom';
      flare.position.y = 8.4;
      flare.scale.set(9, 9, 1);
      const lanternLight = new THREE.PointLight(0xffc76d, coarsePointer ? 70 : 52, 28, 2);
      lanternLight.name = 'chronicles-f1-beacon-stone-wash';
      lanternLight.position.y = 8.4;
      activatedRoot.add(lamp, halo, flare, lanternLight);
      activatedRoot.visible = false;
      root.add(activatedRoot);
    } else if (entry.visualType === 'shrine') {
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.7, 10), stone);
      basin.position.y = 0.35;
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 10),
        material(0x6fb4e0, { emissive: 0x1d5f8a, emissiveIntensity: 0.6 }));
      water.position.y = 0.72;
      root.add(basin, water);
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
    const enemy = buildChroniclesEnemyVisual(definition.visualType || definition.id, { coarsePointer, sprites: true })?.model;
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

// Ground (multiplies the grass texture), rock and sky per Terra biome.
const TERRA_BIOMES = Object.freeze({
  plains: Object.freeze({ ground: 0xffffff, rock: 0xb9b09f, sky: 0xb4d4df }),
  hills: Object.freeze({ ground: 0xd8d0a0, rock: 0x9a8e78, sky: 0xbcd2dc }),
  marsh: Object.freeze({ ground: 0x8ea07c, rock: 0x5e6a52, sky: 0xa9b8ac }),
  coast: Object.freeze({ ground: 0xffffff, rock: 0x8a8478, sky: 0xa6d0ea, texture: 'sand' }),
  snow: Object.freeze({ ground: 0xffffff, rock: 0xd4dce4, sky: 0xdce6ee, texture: 'snow' }),
  ash: Object.freeze({ ground: 0xffffff, rock: 0x3e3634, sky: 0xc0a894, texture: 'ashland' }),
});

function terraGroundTexture(kind) {
  const texture = chroniclesPixelTexture(kind);
  texture.repeat.set(20, 20);
  return texture;
}

// A shop's style comes from the authored NPC standing at its door
// (`visualType: building-<style>`); unclaimed blocks are homes.
const TOWN_BUILDING_STYLES = Object.freeze({
  forge: Object.freeze({ roof: 0x8a4632, emblem: 'swords' }),
  armor: Object.freeze({ roof: 0x4a657e, emblem: 'shield' }),
  tavern: Object.freeze({ roof: 0x995e37, emblem: 'mug' }),
  temple: Object.freeze({ roof: 0x65758a, emblem: 'sun' }),
  store: Object.freeze({ roof: 0x7a6a3c, emblem: 'sack' }),
  apothecary: Object.freeze({ roof: 0x554481, emblem: 'crystal' }),
  guild: Object.freeze({ roof: 0x3f4f8a, emblem: 'crystal' }),
  watch: Object.freeze({ roof: 0x5c3b38, emblem: 'shield' }),
  hall: Object.freeze({ roof: 0x6e2e2a, emblem: 'sun' }),
});
const TOWN_HOME_STYLES = Object.freeze([
  Object.freeze({ roof: 0x7d4a36, emblem: 'home' }),
  Object.freeze({ roof: 0x5d6b52, emblem: 'home' }),
  Object.freeze({ roof: 0x6e5a74, emblem: 'crystal' }),
  Object.freeze({ roof: 0x8b5b3a, emblem: 'home' }),
]);

// Wide blocks face north/south, tall blocks east/west — always toward the
// side whose door cell is walkable and nearer the town centre.
export function settlementHouseFacing(block, grid, center) {
  const { minX, maxX, minY, maxY } = block;
  const cx = Math.round(block.cx);
  const cy = Math.round(block.cy);
  const open = ({ x, y }) => grid[y]?.[x] === '.';
  const options = (maxX - minX) >= (maxY - minY)
    ? [
      { yaw: 0, door: { x: cx, y: maxY + 1 }, toward: center.y >= block.cy },
      { yaw: Math.PI, door: { x: cx, y: minY - 1 }, toward: center.y < block.cy },
    ]
    : [
      { yaw: Math.PI / 2, door: { x: maxX + 1, y: cy }, toward: center.x >= block.cx },
      { yaw: -Math.PI / 2, door: { x: minX - 1, y: cy }, toward: center.x < block.cx },
    ];
  return options.find(o => o.toward && open(o.door)) || options.find(o => open(o.door)) || options[0];
}

function TOWN_TREE_CELLS(width, height) {
  return [[-1, -1], [width, -1], [-1, height], [width, height],
    [-1, Math.floor(height / 2)], [width, Math.floor(height / 2)],
    [Math.floor(width / 4), -1], [Math.floor(width * 3 / 4), -1]];
}

// Solid interior '#' blocks of at least 2×2 cells become houses (a block may
// back onto the town wall; the wall itself is never part of a block),
// ordered north-west → south-east for a stable style mapping.
export function settlementHouseBlocks(grid, width, height) {
  const seen = new Set();
  const blocks = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (grid[y]?.[x] !== '#' || seen.has(x + ',' + y)) continue;
      const cells = [];
      const queue = [{ x, y }];
      seen.add(x + ',' + y);
      while (queue.length) {
        const cell = queue.pop();
        cells.push(cell);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cell.x + dx;
          const ny = cell.y + dy;
          const key = nx + ',' + ny;
          const interior = nx > 0 && ny > 0 && nx < width - 1 && ny < height - 1;
          if (interior && grid[ny]?.[nx] === '#' && !seen.has(key)) { seen.add(key); queue.push({ x: nx, y: ny }); }
        }
      }
      const xs = cells.map(c => c.x);
      const ys = cells.map(c => c.y);
      const minX = Math.min(...xs); const maxX = Math.max(...xs);
      const minY = Math.min(...ys); const maxY = Math.max(...ys);
      const solid = cells.length === (maxX - minX + 1) * (maxY - minY + 1);
      if (!solid || maxX - minX < 1 || maxY - minY < 1) continue;
      blocks.push({ cells, minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 });
    }
  }
  return blocks;
}

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
  const bark = chroniclesPixelTexture('bark');
  bark.repeat.set(2, 3); // ≈16 texels per metre around a trunk
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.22, 0.34, 3.2, 7),
    material(0xffffff, { map: bark }),
    count,
  );
  const foliage = chroniclesPixelTexture('leaves');
  foliage.repeat.set(6, 2);
  const lower = new THREE.InstancedMesh(new THREE.ConeGeometry(1.75, 3.4, 8), material(0xc8d6c0, { map: foliage }), count);
  const upper = new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 2.7, 8), material(0xffffff, { map: foliage }), count);
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
