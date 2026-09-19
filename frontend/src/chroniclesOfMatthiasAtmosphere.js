import * as THREE from 'three';
import { chroniclesIsometricScenePlan } from './chronicles/chroniclesIsometricScenePlan.js';
import { buildChroniclesDungeonCeiling } from './chroniclesOfMatthiasCeiling.js';
import { buildChroniclesSurfacePatina } from './chroniclesOfMatthiasSurfacePatina.js';

const CELL = 4;
const DUST_DESKTOP = 84;
const DUST_COARSE = 24;

function unitNoise(index, salt) {
  let value = Math.imul(index + salt * 101, 374761393) ^ Math.imul(index * 17 + salt, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

function walkableCells(scenePlan) {
  return (scenePlan?.floors || []).map(({ x, y }) => ({ x, y }));
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

function createDust(count, scenePlan) {
  const cells = walkableCells(scenePlan);
  const positions = new Float32Array(count * 3);
  const baseY = new Float32Array(count);
  const phases = new Float32Array(count);
  const center = scenePlan?.center || { x: 0, y: 0 };

  for (let index = 0; index < count; index += 1) {
    const cell = cells[index % cells.length];
    const wx = (cell.x - center.x) * CELL;
    const wz = (cell.y - center.y) * CELL;
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

function addReadabilityLighting(root, { coarsePointer }) {
  // Chronicles should be gloomy, not crushed. The ambient level is deliberately
  // high enough to preserve stone/material detail after ACES while practical
  // torches still carry the mood and direction of the scene.
  const ambient = new THREE.AmbientLight(0x73808c, coarsePointer ? 0.88 : 0.8);
  ambient.name = 'chronicles-readability-ambient';

  // Keep the carried torch as a foreground cue rather than an orange wash over
  // the whole corridor. The entry still reads warm, but the mid/far planes are
  // deliberately left for the cooler crypt lighting below.
  const entryBounce = new THREE.PointLight(
    0xd99554,
    coarsePointer ? 3.25 : 2.72,
    12.8,
    1.95,
  );
  entryBounce.name = 'chronicles-readability-entry-bounce';
  entryBounce.position.set(-6.2, 1.35, 8.1);
  entryBounce.castShadow = false;

  const cryptBounce = new THREE.PointLight(
    0x7d96b0,
    coarsePointer ? 2.72 : 2.38,
    16.5,
    1.9,
  );
  cryptBounce.name = 'chronicles-readability-crypt-bounce';
  cryptBounce.position.set(0.4, 1.75, -1.2);
  cryptBounce.castShadow = false;

  // A low, warm bounce skims the first corridor instead of lifting the whole
  // exposure. Damp slabs and bump relief catch it while the ceiling stays dark.
  const floorBounce = new THREE.PointLight(
    0xcd8147,
    coarsePointer ? 2.62 : 2.18,
    coarsePointer ? 9.0 : 9.8,
    2.05,
  );
  floorBounce.name = 'chronicles-readability-floor-bounce';
  floorBounce.position.set(-2.8, 0.42, 8.05);
  floorBounce.castShadow = false;

  // Broad corridor fill recovers the middle distance. Its blue-grey temperature
  // separates damp stone from the party torch and gives the corridor real depth.
  const corridorFill = new THREE.PointLight(
    0x91aabd,
    coarsePointer ? 2.34 : 2.16,
    18.5,
    1.55,
  );
  corridorFill.name = 'chronicles-readability-corridor-fill';
  corridorFill.position.set(0.8, 2.35, 7.9);
  corridorFill.castShadow = false;

  // The far wall is intentionally cool: enemies keep their warm/red practicals,
  // while the architecture behind them recedes into a colder plane. This creates
  // silhouette separation without adding another visible lamp to the fiction.
  const farFill = new THREE.PointLight(
    0x6f8fa8,
    coarsePointer ? 1.62 : 1.46,
    12.8,
    1.82,
  );
  farFill.name = 'chronicles-readability-far-fill';
  farFill.position.set(7.25, 2.15, 8.0);
  farFill.castShadow = false;

  // The party is explicitly carrying torches. These two shadowless practicals
  // travel with the first-person camera. They now stay local to the foreground,
  // leaving the authored cold fills enough room to model the middle distance.
  const partyTorchKey = new THREE.PointLight(
    0xffad67,
    coarsePointer ? 5.85 : 5.72,
    coarsePointer ? 13.8 : 14.6,
    1.58,
  );
  partyTorchKey.name = 'chronicles-party-torch-key';
  partyTorchKey.castShadow = false;

  const partyTorchBounce = new THREE.PointLight(
    0xd47b3f,
    coarsePointer ? 2.72 : 2.38,
    coarsePointer ? 9.4 : 9.8,
    1.76,
  );
  partyTorchBounce.name = 'chronicles-party-torch-bounce';
  partyTorchBounce.castShadow = false;

  root.add(
    ambient,
    entryBounce,
    cryptBounce,
    floorBounce,
    corridorFill,
    farFill,
    partyTorchKey,
    partyTorchBounce,
  );
  return {
    count: 8,
    partyTorchKey,
    partyTorchBounce,
    partyTorchKeyBaseIntensity: partyTorchKey.intensity,
    partyTorchBounceBaseIntensity: partyTorchBounce.intensity,
  };
}

export function buildChroniclesDungeonAtmosphere({
  coarsePointer = false,
  reducedMotion = false,
  scenePlan = chroniclesIsometricScenePlan(),
} = {}) {
  const root = new THREE.Group();
  root.name = 'chronicles-dungeon-atmosphere';
  root.add(buildChroniclesDungeonCeiling({ coarsePointer, scenePlan }));
  root.add(buildChroniclesSurfacePatina({ coarsePointer, scenePlan }));
  const readabilityLighting = addReadabilityLighting(root, { coarsePointer });

  const dustCount = coarsePointer ? DUST_COARSE : DUST_DESKTOP;
  const dustData = createDust(dustCount, scenePlan);
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
      { name: 'chronicles-gate-mist', x: 0, z: -7.15, width: 4.5, depth: 2.2, color: 0x929ca4, opacity: 0.075, rotation: 0.04 },
      { name: 'chronicles-sigil-mist', x: 0.1, z: 4.15, width: 4.15, depth: 2.35, color: 0xb39272, opacity: 0.062, rotation: -0.13 },
      { name: 'chronicles-crypt-mist', x: 0, z: 8.25, width: 4.8, depth: 2.7, color: 0x7890a0, opacity: 0.082, rotation: 0.08 },
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
  const partyForward = new THREE.Vector3();
  const partyRight = new THREE.Vector3();
  const partyKeyPosition = new THREE.Vector3();
  const partyBouncePosition = new THREE.Vector3();
  let partyCamera = null;

  function updatePartyTorch(time) {
    if (!partyCamera) {
      partyCamera = root.parent?.getObjectByProperty?.('isPerspectiveCamera', true)
        || root.parent?.getObjectByProperty?.('isCamera', true)
        || null;
    }
    if (!partyCamera) return;

    partyCamera.getWorldDirection(partyForward);
    partyRight.setFromMatrixColumn(partyCamera.matrixWorld, 0).normalize();

    partyKeyPosition.copy(partyCamera.position)
      .addScaledVector(partyForward, 0.48)
      .addScaledVector(partyRight, 0.38);
    partyKeyPosition.y -= 0.28;
    readabilityLighting.partyTorchKey.position.copy(partyKeyPosition);

    partyBouncePosition.copy(partyCamera.position)
      .addScaledVector(partyForward, 0.16)
      .addScaledVector(partyRight, -0.18);
    partyBouncePosition.y = Math.max(0.38, partyBouncePosition.y - 0.96);
    readabilityLighting.partyTorchBounce.position.copy(partyBouncePosition);

    const flicker = reducedMotion
      ? 1
      : 0.97 + Math.sin(time * 7.6) * 0.035 + Math.sin(time * 16.4 + 0.7) * 0.018;
    readabilityLighting.partyTorchKey.intensity = readabilityLighting.partyTorchKeyBaseIntensity * flicker;
    readabilityLighting.partyTorchBounce.intensity = readabilityLighting.partyTorchBounceBaseIntensity * (0.985 + (flicker - 0.97) * 0.42);
  }

  function update(time) {
    updatePartyTorch(time);
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
    readabilityLightCount: readabilityLighting.count,
  };
  root.userData.updateChroniclesAtmosphere = update;
  return root;
}
