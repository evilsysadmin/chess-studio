import * as THREE from 'three';
import { CHRONICLES_MAP } from './chroniclesOfMatthias.js';
import { buildChroniclesDungeonCeiling } from './chroniclesOfMatthiasCeiling.js';

const CELL = 4;
const DUST_DESKTOP = 84;
const DUST_COARSE = 24;

function unitNoise(index, salt) {
  let value = Math.imul(index + salt * 101, 374761393) ^ Math.imul(index * 17 + salt, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
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

function createSoftMistTexture(size = 48) {
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size * 0.5;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - center) / radius;
      const dy = (y - center) / radius;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const feather = Math.max(0, Math.min(1, 1 - distance));
      const alpha = Math.round(255 * feather * feather * (3 - 2 * feather));
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createDust(count) {
  const cells = walkableCells();
  const positions = new Float32Array(count * 3);
  const baseY = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const cell = cells[index % cells.length];
    const wx = (cell.x - 3) * CELL;
    const wz = (cell.y - 3) * CELL;
    const x = wx + (unitNoise(index, 3) - 0.5) * 3.05;
    const y = 0.34 + unitNoise(index, 7) * 2.75;
    const z = wz + (unitNoise(index, 11) - 0.5) * 3.05;
    const offset = index * 3;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    baseY[index] = y;
    phases[index] = unitNoise(index, 17) * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return { geometry, baseY, phases };
}

function addMistPatch(root, texture, { name, x, z, width, depth, color, opacity, rotation = 0 }) {
  const material = new THREE.MeshBasicMaterial({
    color,
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.name = name;
  mesh.position.set(x, 0.075, z);
  mesh.rotation.set(-Math.PI / 2, 0, rotation);
  mesh.renderOrder = 1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  root.add(mesh);
  return { material, baseOpacity: opacity };
}

export function buildChroniclesDungeonAtmosphere({ coarsePointer = false, reducedMotion = false } = {}) {
  const root = new THREE.Group();
  root.name = 'chronicles-dungeon-atmosphere';
  root.add(buildChroniclesDungeonCeiling({ coarsePointer }));

  const dustCount = coarsePointer ? DUST_COARSE : DUST_DESKTOP;
  const dustData = createDust(dustCount);
  const dustMaterial = new THREE.PointsMaterial({
    color: coarsePointer ? 0xb8b3a8 : 0xd1c2ad,
    size: coarsePointer ? 0.025 : 0.035,
    sizeAttenuation: true,
    transparent: true,
    opacity: coarsePointer ? 0.11 : 0.18,
    depthWrite: false,
  });
  const dust = new THREE.Points(dustData.geometry, dustMaterial);
  dust.name = 'chronicles-dungeon-dust';
  dust.frustumCulled = false;
  root.add(dust);

  let mistTexture = null;
  let mistTextureDisposed = false;
  const mistMaterials = [];
  if (!coarsePointer) {
    mistTexture = createSoftMistTexture();
    const patches = [
      { name: 'chronicles-gate-mist', x: 0, z: -7.15, width: 4.5, depth: 2.2, color: 0x929ca4, opacity: 0.085, rotation: 0.04 },
      { name: 'chronicles-sigil-mist', x: 0.1, z: 4.15, width: 4.15, depth: 2.35, color: 0xb39272, opacity: 0.07, rotation: -0.13 },
      { name: 'chronicles-crypt-mist', x: 0, z: 8.25, width: 4.8, depth: 2.7, color: 0x7890a0, opacity: 0.095, rotation: 0.08 },
    ].map((config) => addMistPatch(root, mistTexture, config));
    mistMaterials.push(...patches);
    mistMaterials.forEach(({ material }) => {
      material.addEventListener('dispose', () => {
        if (mistTextureDisposed) return;
        mistTextureDisposed = true;
        mistTexture?.dispose();
      });
    });
  }

  const positionAttribute = dustData.geometry.getAttribute('position');
  function update(time) {
    if (reducedMotion) return;
    for (let index = 0; index < dustCount; index += 1) {
      const offset = index * 3 + 1;
      positionAttribute.array[offset] = dustData.baseY[index]
        + Math.sin(time * 0.24 + dustData.phases[index]) * 0.075;
    }
    positionAttribute.needsUpdate = true;
    dustMaterial.opacity = (coarsePointer ? 0.105 : 0.17) + Math.sin(time * 0.18) * 0.012;
    mistMaterials.forEach(({ material, baseOpacity }, index) => {
      material.opacity = baseOpacity * (0.9 + Math.sin(time * (0.17 + index * 0.025) + index) * 0.1);
    });
  }

  root.userData.chroniclesAtmosphereStats = {
    dustCount,
    mistCount: mistMaterials.length,
  };
  root.userData.updateChroniclesAtmosphere = update;
  return root;
}
