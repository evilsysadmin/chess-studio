import * as THREE from 'three';

function ownedMaterial(params) {
  const material = new THREE.MeshStandardMaterial(params);
  material.userData.chroniclesIsoOwned = true;
  return material;
}

export function buildChroniclesCarriedTorch(model, { coarsePointer, phase = 0 } = {}) {
  const root = new THREE.Group();
  root.name = `chronicles-party-carried-torch-${model.userData.chroniclesIsoMemberId || 'member'}`;
  root.position.set(0.38, 0.02, -0.08);

  const iron = ownedMaterial({ color: 0x33251b, roughness: 0.7, metalness: 0.5 });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.5, 7), iron);
  stem.position.set(0, 0.64, 0);
  stem.rotation.z = -0.12;
  stem.castShadow = false;

  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.11, 8), iron);
  cup.position.set(0.03, 0.9, 0);

  const flameMaterial = ownedMaterial({
    color: 0xffd18a,
    emissive: 0xff651d,
    emissiveIntensity: 3.8,
    roughness: 0.28,
    metalness: 0,
  });
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.075, 9, 7), flameMaterial);
  flame.position.set(0.03, 1.02, 0);
  flame.scale.set(0.82, 1.55, 0.82);
  flame.castShadow = false;

  const baseIntensity = coarsePointer ? 1.55 : 1.8;
  const light = new THREE.PointLight(
    0xff9b52,
    baseIntensity,
    coarsePointer ? 4.5 : 5.2,
    1.9,
  );
  light.position.set(0.03, 0.92, 0);
  light.castShadow = false;

  root.add(stem, cup, flame, light);
  model.add(root);
  return { root, flame, light, baseIntensity, phase };
}

export function tickChroniclesCarriedTorch(torch, time) {
  if (!torch?.root.visible) return;
  const pulse = 0.965
    + Math.sin(time * 8.1 + torch.phase) * 0.045
    + Math.sin(time * 17.3 + torch.phase * 0.7) * 0.018;
  torch.light.intensity = torch.baseIntensity * pulse;
  torch.flame.scale.set(
    0.8 + pulse * 0.025,
    1.46 + pulse * 0.12,
    0.8 + pulse * 0.025,
  );
  torch.flame.rotation.z = Math.sin(time * 5.2 + torch.phase) * 0.06;
}
