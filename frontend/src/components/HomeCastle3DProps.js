import * as THREE from 'three';

export const HOME_CASTLE_TORCH_ANCHORS = Object.freeze([
  Object.freeze({ x: -0.72, y: 0.235, z: 0.17 }),
  Object.freeze({ x: 0.72, y: 0.235, z: 0.17 }),
]);

export const HOME_CASTLE_CHANDELIER_LIGHT_ANCHORS = Object.freeze([
  Object.freeze({ x: -0.78, y: 0.72, z: 1.05 }),
  Object.freeze({ x: 0.78, y: 0.72, z: 1.05 }),
]);

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

  for (const anchor of HOME_CASTLE_TORCH_ANCHORS) {
    const torch = new THREE.Group();
    torch.position.set(anchor.x, anchor.y, anchor.z);

    const flame = new THREE.Mesh(flameGeometry, flameMaterial);
    flame.position.y = 0.018;
    flame.scale.set(0.82, 1, 0.82);
    flame.name = 'home-castle-flame';

    torch.add(flame);
    group.add(torch);
  }

  return {
    group,
    flames: group.children.map((torch) => torch.getObjectByName('home-castle-flame')),
    dispose() {
      flameGeometry.dispose();
      flameMaterial.dispose();
    },
  };
}
