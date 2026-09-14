import * as THREE from 'three';
import { CHRONICLES_MAP } from './chroniclesOfMatthias.js';

const CELL = 4;
const TEXTURE_SIZE = 64;

function noiseByte(x, y, seed) {
  let value = Math.imul(x + seed * 19, 374761393) ^ Math.imul(y + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) & 0xff;
}

function createCeilingTexture(seed, kind) {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const noise = noiseByte(x, y, seed);
      const course = Math.floor(y / 16);
      const localY = y % 16;
      const localX = (x + (course % 2) * 12) % 24;
      const joint = localY < 2 || localX < 2;
      const edge = localY < 5 || localX < 5;
      let value = 196 + (noise - 128) * 0.16 + Math.sin((x + seed) * 0.18) * 7;
      if (joint) value = 78 + noise * 0.06;
      else if (edge) value -= 15;

      if (kind === 'roughness') value = joint ? 244 : edge ? 228 : 210 + (noise - 128) * 0.05;
      if (kind === 'height') value = joint ? 58 : edge ? value - 18 : value;

      const offset = (y * TEXTURE_SIZE + x) * 4;
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

function makeStoneMaterial(color, seed, { roughness = 0.94, bumpScale = 0.075 } = {}) {
  const map = createCeilingTexture(seed, 'albedo');
  const bumpMap = createCeilingTexture(seed, 'height');
  const roughnessMap = createCeilingTexture(seed, 'roughness');
  const material = new THREE.MeshPhysicalMaterial({
    color,
    map,
    bumpMap,
    roughnessMap,
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
  });
  return material;
}

function walkableCells() {
  const cells = [];
  CHRONICLES_MAP.forEach((row, y) => {
    [...row].forEach((tile, x) => {
      if (tile !== '#') cells.push({ x, y });
    });
  });
  return cells;
}

export function buildChroniclesDungeonCeiling({ coarsePointer = false } = {}) {
  const root = new THREE.Group();
  root.name = 'chronicles-dungeon-ceiling';
  const mainStone = makeStoneMaterial(0x514b43, 89, { bumpScale: 0.085 });
  const altStone = makeStoneMaterial(0x433f39, 97, { roughness: 0.97, bumpScale: 0.07 });
  const insetStone = makeStoneMaterial(0x292827, 101, { roughness: 0.98, bumpScale: 0.035 });
  const cells = walkableCells();
  let bossCount = 0;

  cells.forEach(({ x, y }, index) => {
    const wx = (x - 3) * CELL;
    const wz = (y - 3) * CELL;
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
