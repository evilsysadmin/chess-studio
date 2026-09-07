import * as THREE from 'three';

export const TRAIL_RENDER_HOT_PATH_VERSION = 'instanced-track-buffered-aim-v1';

function createTrackBatch({ count, geometry, material, positions }) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.userData.trailTrackBatch = TRAIL_RENDER_HOT_PATH_VERSION;
  const matrix = new THREE.Matrix4();

  const sync = () => {
    for (let index = 0; index < count; index += 1) {
      const offset = index * 2;
      matrix.makeTranslation(positions[offset], 0.02, positions[offset + 1]);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  sync();
  return { mesh, positions, sync };
}

export function createTrailInstancedTrack({
  rows,
  lanes,
  tileSize,
  playerZ,
  laneX,
} = {}) {
  const safeRows = Math.max(1, Math.floor(Number(rows) || 1));
  const safeLanes = Math.max(1, Math.floor(Number(lanes) || 1));
  const safeTileSize = Number(tileSize) || 1;
  const geometryLight = new THREE.BoxGeometry(safeTileSize * 0.96, 0.11, safeTileSize * 0.96);
  const geometryDark = geometryLight.clone();
  const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xc6b27b, roughness: 0.8, metalness: 0.02 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x3c352b, roughness: 0.82, metalness: 0.03 });
  const lightPositions = [];
  const darkPositions = [];

  for (let row = 0; row < safeRows; row += 1) {
    for (let lane = 0; lane < safeLanes; lane += 1) {
      const target = (row + lane) % 2 ? darkPositions : lightPositions;
      target.push(laneX(lane),  Number(playerZ) - row * safeTileSize);
    }
  }

  const group = new THREE.Group();
  group.userData.trailTrackHotPath = TRAIL_RENDER_HOT_PATH_VERSION;
  const light = createTrackBatch({
    count: lightPositions.length / 2,
    geometry: geometryLight,
    material: lightMaterial,
    positions: new Float32Array(lightPositions),
  });
  const dark = createTrackBatch({
    count: darkPositions.length / 2,
    geometry: geometryDark,
    material: darkMaterial,
    positions: new Float32Array(darkPositions),
  });
  group.add(light.mesh, dark.mesh);

  const wrapDistance = safeRows * safeTileSize;
  const frontLimit = Number(playerZ) + safeTileSize;

  function advance(distance) {
    const delta = Number(distance) || 0;
    if (!delta) return;
    for (const batch of [light, dark]) {
      const positions = batch.positions;
      for (let offset = 1; offset < positions.length; offset += 2) {
        let z = positions[offset] + delta;
        if (z > frontLimit) z -= wrapDistance;
        positions[offset] = z;
      }
      batch.sync();
    }
  }

  return {
    group,
    advance,
    light: light.mesh,
    dark: dark.mesh,
    tileCount: safeRows * safeLanes,
    drawMeshes: 2,
  };
}

export function createTrailBishopAimLine(parent) {
  const positions = new Float32Array(6);
  const lineDistances = new Float32Array(2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('lineDistance', new THREE.BufferAttribute(lineDistances, 1));
  const material = new THREE.LineDashedMaterial({
    color: 0xf1c75b,
    dashSize: 0.38,
    gapSize: 0.2,
    transparent: true,
    opacity: 0.78,
  });
  const line = new THREE.Line(geometry, material);
  line.userData.trailBishopAimHotPath = TRAIL_RENDER_HOT_PATH_VERSION;
  parent?.add?.(line);
  return line;
}

export function updateTrailBishopAimLine(line, {
  startX,
  startZ,
  targetX,
  targetZ,
  startY = 0.34,
  targetY = 0.18,
} = {}) {
  if (!line?.geometry) return line;
  const position = line.geometry.getAttribute('position');
  const distance = line.geometry.getAttribute('lineDistance');
  if (!position?.array || !distance?.array) return line;

  const points = position.array;
  points[0] = Number(startX) || 0;
  points[1] = Number(startY) || 0;
  points[2] = Number(startZ) || 0;
  points[3] = Number(targetX) || 0;
  points[4] = Number(targetY) || 0;
  points[5] = Number(targetZ) || 0;
  position.needsUpdate = true;

  const dx = points[3] - points[0];
  const dy = points[4] - points[1];
  const dz = points[5] - points[2];
  distance.array[0] = 0;
  distance.array[1] = Math.sqrt(dx * dx + dy * dy + dz * dz);
  distance.needsUpdate = true;
  line.geometry.computeBoundingSphere();
  return line;
}

export function nearestTrailObject(objects, {
  lane,
  kind = null,
  minZ = -Infinity,
  maxZ = Infinity,
} = {}) {
  let best = null;
  for (const item of objects || []) {
    if (item?.lane !== lane) continue;
    if (item.z < minZ || item.z > maxZ) continue;
    if (kind && item.kind !== kind) continue;
    if (!best || item.z > best.z) best = item;
  }
  return best;
}
