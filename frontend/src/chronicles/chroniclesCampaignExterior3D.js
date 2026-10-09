import * as THREE from 'three';
import { createSwordhavenSkyDome, swordhavenGrassTexture } from './chroniclesSwordhaven3D.js';

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
  const earth = material(0xffffff, { map: swordhavenGrassTexture() });
  const stone = material(roadMap ? 0x77756c : 0xaba18f);
  const paver = material(roadMap ? 0xb8ab91 : 0xc6bba5);
  const timber = material(0x4d3424);
  const linen = material(0x963f32, { side: THREE.DoubleSide });
  const plaque = material(0xc4aa70, { metalness: 0.47, roughness: 0.45 });

  scene.background = new THREE.Color(0xb4d4df);
  scene.fog = new THREE.Fog(0xb4d4df, 55, Math.max(width, height) * CELL * 1.65);
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
  const terrain = new THREE.Mesh(new THREE.BoxGeometry(width * CELL, 0.25, height * CELL), earth);
  terrain.name = 'chronicles-campaign-terrain';
  terrain.position.y = -0.19;
  terrain.receiveShadow = true;
  scene.add(terrain);

  const roadCells = visibleRoadCells(scenePlan, sceneCenter).filter(({ x, y }) => grid[y]?.[x] === '.');
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
  if (blocked.length) {
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
    const [wx, wz] = gridToWorld(entry.position.x, entry.position.y, sceneCenter);
    const root = new THREE.Group();
    root.name = 'chronicles-campaign-content-' + entry.id;
    root.userData.chroniclesContentId = entry.id;
    root.position.set(wx, 0, wz);
    if (entry.kind === 'exit') {
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
    contentProps.push({ id: entry.id, kind: entry.kind, root, phase: 0 });
  }

  return {
    enemies: {}, enemyDefinitions: [],
    spectralChapel: new THREE.Group(),
    sigilMaterial: material(0x99866b),
    gateMaterial: material(0x74614b),
    gateRunes: [], torches: [], contentProps, sceneCenter, materialArt: null,
  };
}
