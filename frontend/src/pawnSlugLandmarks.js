import * as THREE from 'three';

export const PAWN_SLUG_LANDMARK_META = Object.freeze({
  landmarks: Object.freeze([
    Object.freeze({ id: 'command-post', x: 29.5, label: 'Puesto de mando bombardeado' }),
    Object.freeze({ id: 'wrecked-searchlight', x: 66.5, label: 'Reflector derribado' }),
    Object.freeze({ id: 'hero-barricade', x: 104.5, label: 'Barricada de última línea' }),
  ]),
  desktopDetailBudget: 3,
  coarseDetailBudget: 1,
  desktopLocalLightBudget: 2,
  coarseLocalLightBudget: 0,
});

function material(color, roughness = 0.8, metalness = 0.08, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });
}

function mesh(geometry, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const node = new THREE.Mesh(geometry, mat);
  node.position.set(x, y, z);
  node.rotation.set(rx, ry, rz);
  node.castShadow = true;
  node.receiveShadow = true;
  return node;
}

function localPointLight(name, color, intensity, distance, { x = 0, y = 0, z = 0 } = {}) {
  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.name = name;
  light.position.set(x, y, z);
  light.castShadow = false;
  return light;
}

function commandPost(x, coarse) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-landmark-command-post';
  root.position.set(x, 0, 1.72);

  root.add(
    mesh(new THREE.BoxGeometry(3.45, 0.95, 1.55), material(0x34363a, 0.94, 0.06), { y: 0.48 }),
    mesh(new THREE.BoxGeometry(3.85, 0.2, 1.82), material(0x25282b, 0.9, 0.12), { y: 1.05, rz: -0.025 }),
    mesh(new THREE.BoxGeometry(1.15, 0.58, 0.12), material(0x111315, 0.98), { x: 0.55, y: 0.62, z: 0.82 }),
    mesh(new THREE.BoxGeometry(0.85, 0.48, 0.14), material(0x161719, 0.98), { x: -0.86, y: 0.58, z: 0.83 }),
  );

  const antennaMat = material(0x60666b, 0.48, 0.62);
  root.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.1, 7), antennaMat, { x: -1.2, y: 2.02, rz: -0.08 }));
  if (!coarse) {
    const lampMaterial = material(0xe7b86a, 0.34, 0.08, 0xffb34f, 2.1);
    const lamp = mesh(new THREE.SphereGeometry(0.09, 8, 6), lampMaterial, { x: 1.26, y: 0.82, z: 0.87 });
    lamp.name = 'pawn-slug-command-post-lamp';
    lamp.castShadow = false;
    root.add(
      lamp,
      localPointLight('pawn-slug-command-post-light', 0xffb45f, 0.95, 5.2, { x: 1.2, y: 1.02, z: 1.05 }),
    );
    for (let i = 0; i < 5; i += 1) {
      root.add(mesh(new THREE.SphereGeometry(0.18, 8, 6), material(0x625746, 1), { x: -1.35 + i * 0.46, y: 0.16, z: 0.93, rz: (i % 2 ? 1 : -1) * 0.06 }));
    }
    for (let i = 0; i < 4; i += 1) {
      root.add(mesh(new THREE.BoxGeometry(0.18 + i * 0.03, 0.055, 0.09), material(0x55595c, 0.72, 0.34), {
        x: -1.45 + i * 0.85,
        y: 0.07,
        z: 1.02 + (i % 2) * 0.08,
        rz: -0.22 + i * 0.14,
      }));
    }
  }
  return root;
}

function wreckedSearchlight(x, coarse) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-landmark-wrecked-searchlight';
  root.position.set(x, 0, 1.55);

  const steel = material(0x454b50, 0.62, 0.48);
  root.add(
    mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.65, 8), steel.clone(), { x: -0.38, y: 0.72, rz: 0.46 }),
    mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.55, 8), steel.clone(), { x: 0.38, y: 0.7, rz: -0.56 }),
    mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.55, 8), steel.clone(), { x: 0.12, y: 0.68, rx: 0.32, rz: 0.12 }),
  );

  const pivot = new THREE.Group();
  pivot.position.set(0.18, 1.42, 0);
  pivot.rotation.z = -0.63;
  const housing = mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.5, coarse ? 10 : 16), material(0x4c5359, 0.48, 0.52), { rz: Math.PI / 2 });
  const lensMaterial = material(0x9a8053, 0.3, 0.12, 0xf0a94f, coarse ? 0.18 : 1.25);
  lensMaterial.transparent = true;
  lensMaterial.opacity = coarse ? 0.48 : 0.72;
  const lens = mesh(new THREE.CircleGeometry(0.31, coarse ? 10 : 18), lensMaterial, { x: 0.27, ry: Math.PI / 2 });
  lens.name = 'pawn-slug-searchlight-lens';
  lens.castShadow = false;
  pivot.add(housing, lens);
  root.add(pivot);

  if (!coarse) {
    root.add(
      localPointLight('pawn-slug-searchlight-glow', 0xf1ac5d, 0.65, 4.4, { x: 0.42, y: 1.42, z: 0.15 }),
      mesh(new THREE.BoxGeometry(0.72, 0.12, 0.16), material(0x353a3e, 0.74, 0.42), { x: -0.72, y: 0.12, z: 0.22, rz: 0.26 }),
      mesh(new THREE.BoxGeometry(0.52, 0.09, 0.12), material(0x2b3034, 0.78, 0.38), { x: 0.88, y: 0.09, z: 0.14, rz: -0.34 }),
    );
  }
  return root;
}

function heroBarricade(x, coarse) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-landmark-hero-barricade';
  root.position.set(x, 0, 1.62);
  const bag = material(0x655946, 0.98, 0.01);
  const rows = coarse ? 2 : 3;
  for (let row = 0; row < rows; row += 1) {
    const count = 7 - row;
    for (let i = 0; i < count; i += 1) {
      const node = mesh(new THREE.SphereGeometry(0.25, 8, 6), bag.clone(), {
        x: (i - (count - 1) / 2) * 0.42 + row * 0.08,
        y: 0.13 + row * 0.2,
        z: (i % 2) * 0.035,
        rz: (i % 2 ? 1 : -1) * 0.04,
      });
      node.scale.set(1.18, 0.56, 0.82);
      root.add(node);
    }
  }

  const plate = mesh(new THREE.BoxGeometry(1.6, 0.54, 0.09), material(0x303438, 0.66, 0.45), { y: 0.94, z: 0.02, rz: -0.04 });
  root.add(plate);
  if (!coarse) {
    const redPaint = new THREE.MeshBasicMaterial({ color: 0xb64934 });
    root.add(
      mesh(new THREE.BoxGeometry(0.08, 0.36, 0.04), redPaint, { x: -0.5, y: 0.95, z: 0.075 }),
      mesh(new THREE.BoxGeometry(0.36, 0.08, 0.04), redPaint.clone(), { x: -0.5, y: 0.95, z: 0.077 }),
      mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 7), material(0x262a2d, 0.52, 0.55), { x: 1.22, y: 1.36, rz: -0.15 }),
    );

    const obstacle = new THREE.Group();
    obstacle.name = 'pawn-slug-barricade-hedgehog';
    obstacle.position.set(1.85, 0.38, 0.18);
    const beamMaterial = material(0x343a3f, 0.62, 0.5);
    for (const angle of [-Math.PI / 3, 0, Math.PI / 3]) {
      obstacle.add(mesh(new THREE.BoxGeometry(1.15, 0.11, 0.11), beamMaterial.clone(), { rz: angle }));
    }
    root.add(obstacle);
  }
  return root;
}

export function createPawnSlugPremiumLandmarks(parent, { coarse = false } = {}) {
  if (!parent) throw new Error('Pawn Slug landmarks require a parent group');
  const root = new THREE.Group();
  root.name = 'pawn-slug-premium-landmarks';
  root.add(
    commandPost(PAWN_SLUG_LANDMARK_META.landmarks[0].x, coarse),
    wreckedSearchlight(PAWN_SLUG_LANDMARK_META.landmarks[1].x, coarse),
    heroBarricade(PAWN_SLUG_LANDMARK_META.landmarks[2].x, coarse),
  );
  parent.add(root);
  return root;
}
