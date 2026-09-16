import * as THREE from 'three';
import { chroniclesIsometricScenePlan } from './chronicles/chroniclesIsometricScenePlan.js';

const CELL = 4;
const TEXTURE_SIZE = 64;

function noiseByte(x, y, seed) {
  let value = Math.imul(x + seed * 19, 374761393) ^ Math.imul(y + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) & 0xff;
}

function surfaceValue(x, y, seed, kind = 'height') {
  const wrappedX = (x + TEXTURE_SIZE) % TEXTURE_SIZE;
  const wrappedY = (y + TEXTURE_SIZE) % TEXTURE_SIZE;
  const noise = noiseByte(wrappedX, wrappedY, seed);
  const course = Math.floor(wrappedY / 16);
  const localY = wrappedY % 16;
  const localX = (wrappedX + (course % 2) * 12) % 24;
  const joint = localY < 2 || localX < 2;
  const edge = localY < 5 || localX < 5;
  let value = 196 + (noise - 128) * 0.16 + Math.sin((wrappedX + seed) * 0.18) * 7;
  if (joint) value = 78 + noise * 0.06;
  else if (edge) value -= 15;

  if (kind === 'roughness') return joint ? 244 : edge ? 228 : 210 + (noise - 128) * 0.05;
  if (kind === 'height') return joint ? 58 : edge ? value - 18 : value;
  return value;
}

function createCeilingTexture(seed, kind) {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const offset = (y * TEXTURE_SIZE + x) * 4;

      if (kind === 'normal') {
        const left = surfaceValue(x - 1, y, seed, 'height');
        const right = surfaceValue(x + 1, y, seed, 'height');
        const up = surfaceValue(x, y - 1, seed, 'height');
        const down = surfaceValue(x, y + 1, seed, 'height');
        const dx = ((right - left) / 255) * 2.3;
        const dy = ((down - up) / 255) * 2.3;
        const invLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        data[offset] = Math.round((-dx * invLength * 0.5 + 0.5) * 255);
        data[offset + 1] = Math.round((-dy * invLength * 0.5 + 0.5) * 255);
        data[offset + 2] = Math.round((invLength * 0.5 + 0.5) * 255);
      } else {
        const value = surfaceValue(x, y, seed, kind);
        if (kind === 'albedo') {
          data[offset] = Math.max(38, Math.min(235, Math.round(value + 5)));
          data[offset + 1] = Math.max(38, Math.min(235, Math.round(value + 1)));
          data[offset + 2] = Math.max(38, Math.min(235, Math.round(value - 5)));
        } else {
          const mono = Math.max(34, Math.min(248, Math.round(value)));
          data[offset] = mono;
          data[offset + 1] = mono;
          data[offset + 2] = mono;
        }
      }
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.18, 1.18);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = kind === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeStoneMaterial(color, seed, { roughness = 0.94, bumpScale = 0.075, normalScale = 0.5 } = {}) {
  const map = createCeilingTexture(seed, 'albedo');
  const bumpMap = createCeilingTexture(seed, 'height');
  const roughnessMap = createCeilingTexture(seed, 'roughness');
  const normalMap = createCeilingTexture(seed, 'normal');
  const material = new THREE.MeshPhysicalMaterial({
    color,
    map,
    bumpMap,
    roughnessMap,
    normalMap,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    bumpScale,
    roughness,
    metalness: 0.02,
    clearcoat: 0.015,
    clearcoatRoughness: 0.9,
  });
  let disposed = false;
  material.addEventListener('dispose', () => {
    if (disposed) return;
    disposed = true;
    map.dispose();
    bumpMap.dispose();
    roughnessMap.dispose();
    normalMap.dispose();
  });
  return material;
}

function walkableCells(scenePlan) {
  return (scenePlan?.floors || []).map(({ x, y }) => ({ x, y }));
}

export function buildChroniclesDungeonCeiling({
  coarsePointer = false,
  scenePlan = chroniclesIsometricScenePlan(),
} = {}) {
  const root = new THREE.Group();
  root.name = 'chronicles-dungeon-ceiling';
  const mainStone = makeStoneMaterial(0x514b43, 89, { bumpScale: 0.085, normalScale: coarsePointer ? 0.42 : 0.58 });
  const altStone = makeStoneMaterial(0x433f39, 97, { roughness: 0.97, bumpScale: 0.07, normalScale: coarsePointer ? 0.38 : 0.52 });
  const insetStone = makeStoneMaterial(0x292827, 101, { roughness: 0.98, bumpScale: 0.035, normalScale: coarsePointer ? 0.3 : 0.42 });
  const cells = walkableCells(scenePlan);
  const centerX = Number(scenePlan?.center?.x ?? 0);
  const centerY = Number(scenePlan?.center?.y ?? 0);
  let bossCount = 0;

  cells.forEach(({ x, y }, index) => {
    const wx = (x - centerX) * CELL;
    const wz = (y - centerY) * CELL;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.94, 0.1, CELL * 0.94),
      (x + y) % 3 === 0 ? altStone : mainStone,
    );
    slab.name = `chronicles-ceiling-slab-${index}`;
    slab.position.set(wx, 3.43, wz);
    slab.rotation.y = ((x * 5 + y * 7) % 3 - 1) * 0.006;
    slab.castShadow = false;
    slab.receiveShadow = true;
    root.add(slab);

    if (coarsePointer) return;
    const coffer = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.62, 0.026, CELL * 0.62), insetStone);
    coffer.name = `chronicles-ceiling-coffer-${index}`;
    coffer.position.set(wx, 3.365, wz);
    coffer.rotation.y = ((index % 3) - 1) * 0.014;
    coffer.castShadow = false;
    coffer.receiveShadow = true;
    root.add(coffer);

    if (index % 4 === 1) {
      const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.07, 12), altStone);
      boss.name = `chronicles-ceiling-boss-${index}`;
      boss.position.set(wx, 3.315, wz);
      boss.castShadow = false;
      boss.receiveShadow = true;
      root.add(boss);
      bossCount += 1;
    }
  });

  root.userData.chroniclesCeilingStats = {
    slabCount: cells.length,
    cofferCount: coarsePointer ? 0 : cells.length,
    bossCount: coarsePointer ? 0 : bossCount,
  };
  return root;
}
