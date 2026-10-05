import * as THREE from 'three';

function noise(x, y, salt = 0) {
  const value = Math.sin((x + 17.31 + salt) * 12.9898 + (y - 9.17 - salt) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function createRockFaceGeometry(width, height, seed, {
  widthSegments = 4,
  heightSegments = 6,
  depth = 0.075,
} = {}) {
  const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);
  const position = geometry.attributes.position;
  const rowWidth = widthSegments + 1;
  for (let index = 0; index < position.count; index += 1) {
    const px = position.getX(index);
    const py = position.getY(index);
    const column = index % rowWidth;
    const row = Math.floor(index / rowWidth);
    const edgeX = Math.abs(px) / Math.max(0.001, width / 2);
    const edgeY = Math.abs(py) / Math.max(0.001, height / 2);
    const edge = Math.max(edgeX, edgeY);
    const taper = Math.max(0.12, 1 - edge * 0.82);
    const sample = noise(index, seed, 17) - 0.5;
    const ripple = Math.sin((px + seed) * 2.3 + py * 1.7) * 0.035;
    let jaggedX = px;
    let jaggedY = py;
    if (column === 0 || column === widthSegments) {
      const direction = column === 0 ? -1 : 1;
      jaggedX += direction * (noise(row, seed, 31) - 0.35) * width * 0.085;
    }
    if (row === 0) {
      jaggedY += (noise(column, seed, 43) - 0.5) * height * 0.12;
    } else if (row === heightSegments) {
      jaggedY += (noise(column, seed, 47) - 0.5) * height * 0.018;
    }
    if (edge < 0.98) {
      jaggedX += (noise(index, seed, 53) - 0.5) * width * 0.018;
      jaggedY += (noise(index, seed, 61) - 0.5) * height * 0.014;
    }
    position.setXYZ(index, jaggedX, jaggedY, (sample * depth + ripple) * taper);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createRockFloorGeometry(size, seed, {
  segments = 5,
  relief = 0.025,
} = {}) {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  const position = geometry.attributes.position;
  const rowWidth = segments + 1;
  for (let index = 0; index < position.count; index += 1) {
    const px = position.getX(index);
    const py = position.getY(index);
    const column = index % rowWidth;
    const row = Math.floor(index / rowWidth);
    let jaggedX = px;
    let jaggedY = py;

    if (column === 0 || column === segments) {
      const direction = column === 0 ? -1 : 1;
      jaggedX += direction * (noise(row, seed, 211) - 0.5) * size * 0.055;
    }
    if (row === 0 || row === segments) {
      const direction = row === 0 ? 1 : -1;
      jaggedY += direction * (noise(column, seed, 223) - 0.5) * size * 0.055;
    }

    const edgeX = Math.abs(px) / Math.max(0.001, size / 2);
    const edgeY = Math.abs(py) / Math.max(0.001, size / 2);
    const taper = Math.max(0.18, 1 - Math.max(edgeX, edgeY) * 0.72);
    const sample = noise(index, seed, 227) - 0.5;
    const ripple = Math.sin(px * 2.7 + py * 1.9 + seed) * relief * 0.32;
    position.setXYZ(index, jaggedX, jaggedY, (sample * relief + ripple) * taper);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export function createChroniclesCaveWallDressing({
  sceneStyleId = '',
  coarsePointer = false,
  wallCells = null,
  cellSize = 1,
} = {}) {
  if (sceneStyleId !== 'cave-water' || !wallCells?.has) return null;

  function decorate({ root, block, material, x, y, world }) {
    if (!root || !block || !material || !world) return false;

    // Slight overlap hides the regular cell seams while keeping logical geometry,
    // collision, targeting and pathing fully owned by the scene model.
    block.visible = false;

    const exposedFaces = [
      { dx: 0, dy: -1, ox: 0, oz: -1, yaw: Math.PI },
      { dx: 1, dy: 0, ox: 1, oz: 0, yaw: Math.PI / 2 },
      { dx: 0, dy: 1, ox: 0, oz: 1, yaw: 0 },
      { dx: -1, dy: 0, ox: -1, oz: 0, yaw: -Math.PI / 2 },
    ].filter(({ dx, dy }) => !wallCells.has(`${x + dx},${y + dy}`));

    exposedFaces.forEach((face, faceIndex) => {
      const width = cellSize * (1.12 + noise(x, y, 61 + faceIndex) * 0.07);
      const cellHeight = 2.46 + noise(x, y, 71) * 0.3;
      const height = cellHeight + (noise(x, y, 73 + faceIndex) - 0.5) * 0.045;
      const geometry = createRockFaceGeometry(
        width,
        height,
        x * 97 + y * 53 + faceIndex * 19,
        {
          widthSegments: coarsePointer ? 3 : 5,
          heightSegments: coarsePointer ? 4 : 7,
          depth: coarsePointer ? 0.065 : 0.095,
        },
      );
      const faceMesh = new THREE.Mesh(geometry, material);
      faceMesh.name = `chronicles-iso-cave-face-${x}-${y}-${faceIndex}`;
      const outward = cellSize * 0.51;
      faceMesh.position.set(
        world.x + face.ox * outward,
        -0.055 + height / 2,
        world.z + face.oz * outward,
      );
      faceMesh.rotation.y = face.yaw + (noise(x, y, 89 + faceIndex) - 0.5) * 0.04;
      faceMesh.rotation.z = (noise(x, y, 97 + faceIndex) - 0.5) * 0.04;
      faceMesh.castShadow = !coarsePointer;
      faceMesh.receiveShadow = true;
      root.add(faceMesh);
    });
    return true;
  }

  function decorateFloor({ root, material, x, y, world }) {
    if (!root || !material || !world) return false;

    const size = cellSize * (1.055 + noise(x, y, 239) * 0.035);
    const geometry = createRockFloorGeometry(size, x * 131 + y * 83 + 509, {
      segments: coarsePointer ? 3 : 5,
      relief: coarsePointer ? 0.016 : 0.025,
    });
    const surface = new THREE.Mesh(geometry, material);
    surface.name = `chronicles-iso-floor-crust-${x}-${y}`;
    surface.rotation.x = -Math.PI / 2;
    surface.rotation.z = (noise(x, y, 241) - 0.5) * 0.07;
    surface.position.set(
      world.x + (noise(x, y, 251) - 0.5) * cellSize * 0.018,
      0.016 + (noise(x, y, 257) - 0.5) * 0.006,
      world.z + (noise(x, y, 263) - 0.5) * cellSize * 0.018,
    );
    surface.receiveShadow = true;
    root.add(surface);
    return true;
  }

  return Object.freeze({ decorate, decorateFloor });
}
