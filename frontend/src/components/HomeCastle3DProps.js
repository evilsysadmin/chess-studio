import * as THREE from 'three';

export const HOME_CASTLE_TORCH_ANCHORS = Object.freeze([
  Object.freeze({ x: -0.72, y: 0.235, z: 0.17 }),
  Object.freeze({ x: 0.72, y: 0.235, z: 0.17 }),
]);

export const HOME_CASTLE_CHANDELIER_LIGHT_ANCHORS = Object.freeze([
  Object.freeze({ x: -0.78, y: 0.72, z: 1.05 }),
  Object.freeze({ x: 0.78, y: 0.72, z: 1.05 }),
]);

export const HOME_CASTLE_FIREPLACE_LIGHT_ANCHOR = Object.freeze({ x: 1.18, y: -0.52, z: 0.88 });

export const HOME_CASTLE_DUST_MOTE_COUNT = 24;

function fractional(value) {
  return value - Math.floor(value);
}

function createHomeCastleDust() {
  const positions = new Float32Array(HOME_CASTLE_DUST_MOTE_COUNT * 3);
  for (let index = 0; index < HOME_CASTLE_DUST_MOTE_COUNT; index += 1) {
    const seed = index + 1;
    positions[(index * 3)] = -1.15 + (fractional(seed * 0.61803398875) * 2.3);
    positions[(index * 3) + 1] = 0.3 + (fractional(seed * 0.41421356237) * 0.52);
    positions[(index * 3) + 2] = 0.24 + (fractional(seed * 0.754877666) * 0.5);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffe6b8,
    size: 0.006,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const dust = new THREE.Points(geometry, material);
  dust.name = 'home-castle-dust';
  dust.renderOrder = 2;
  return { dust, geometry, material };
}

export function createHomeCastleTorchProps() {
  const group = new THREE.Group();
  group.name = 'home-castle-torches';

  const flameMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb35b,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const flameGeometry = new THREE.ConeGeometry(0.011, 0.032, 10);
  const flames = [];

  for (const anchor of HOME_CASTLE_TORCH_ANCHORS) {
    const torch = new THREE.Group();
    torch.position.set(anchor.x, anchor.y, anchor.z);

    const flame = new THREE.Mesh(flameGeometry, flameMaterial);
    flame.position.y = 0.018;
    flame.scale.set(0.82, 1, 0.82);
    flame.name = 'home-castle-flame';
    flames.push(flame);

    torch.add(flame);
    group.add(torch);
  }

  const dustLayer = createHomeCastleDust();
  group.add(dustLayer.dust);

  return {
    group,
    flames,
    dust: dustLayer.dust,
    dispose() {
      flameGeometry.dispose();
      flameMaterial.dispose();
      dustLayer.geometry.dispose();
      dustLayer.material.dispose();
    },
  };
}
