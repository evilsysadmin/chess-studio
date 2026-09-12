import * as THREE from 'three';

export const HOME_CASTLE_TORCH_ANCHORS = Object.freeze([
  Object.freeze({ x: -1.15, y: 0.25, z: 0.19 }),
  Object.freeze({ x: 1.15, y: 0.25, z: 0.19 }),
]);

export function createHomeCastleTorchProps() {
  const group = new THREE.Group();
  group.name = 'home-castle-torches';

  const iron = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.74, metalness: 0.52 });
  const ember = new THREE.MeshStandardMaterial({
    color: 0xff9a45,
    emissive: 0xff6a22,
    emissiveIntensity: 1.2,
    roughness: 0.62,
    metalness: 0,
  });
  const handleGeometry = new THREE.CylinderGeometry(0.012, 0.017, 0.11, 8);
  const cupGeometry = new THREE.CylinderGeometry(0.03, 0.018, 0.036, 10);
  const flameGeometry = new THREE.ConeGeometry(0.024, 0.065, 10);

  for (const anchor of HOME_CASTLE_TORCH_ANCHORS) {
    const torch = new THREE.Group();
    torch.position.set(anchor.x, anchor.y, anchor.z);

    const handle = new THREE.Mesh(handleGeometry, iron);
    handle.position.y = -0.045;
    handle.rotation.z = anchor.x < 0 ? -0.18 : 0.18;

    const cup = new THREE.Mesh(cupGeometry, iron);
    cup.position.y = 0.018;

    const flame = new THREE.Mesh(flameGeometry, ember);
    flame.position.y = 0.075;
    flame.scale.set(0.82, 1, 0.82);
    flame.name = 'home-castle-flame';

    torch.add(handle, cup, flame);
    group.add(torch);
  }

  return {
    group,
    flames: group.children.map((torch) => torch.getObjectByName('home-castle-flame')),
    dispose() {
      handleGeometry.dispose();
      cupGeometry.dispose();
      flameGeometry.dispose();
      iron.dispose();
      ember.dispose();
    },
  };
}
