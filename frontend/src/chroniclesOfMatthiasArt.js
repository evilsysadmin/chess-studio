import * as THREE from 'three';

function material(color, options = {}) {
  const result = new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.08,
    roughness: options.roughness ?? 0.58,
    clearcoat: options.clearcoat ?? 0.12,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.4,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    envMapIntensity: options.envMapIntensity ?? 0.38,
    specularIntensity: options.specularIntensity ?? 0.34,
  });
  result.userData.chroniclesOwnedMaterial = true;
  return result;
}

function add(group, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0], scale = null, name = '') {
  const node = new THREE.Mesh(geometry, mat);
  node.position.set(...position);
  node.rotation.set(...rotation);
  if (scale) node.scale.set(...scale);
  if (name) node.name = name;
  node.castShadow = true;
  node.receiveShadow = true;
  group.add(node);
  return node;
}

function lathe(group, profile, mat, segments, name) {
  return add(
    group,
    new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), segments),
    mat,
    [0, 0, 0],
    [0, 0, 0],
    null,
    name,
  );
}

function basePlinth(group, stone, metal, segments) {
  lathe(group, [
    [0.62, 0], [0.7, 0.08], [0.66, 0.18], [0.5, 0.25],
    [0.42, 0.31], [0.4, 0.36],
  ], stone, segments, 'chronicles-piece-plinth');
  add(group, new THREE.TorusGeometry(0.52, 0.035, 8, segments), metal, [0, 0.2, 0], [Math.PI / 2, 0, 0], null, 'chronicles-piece-plinth-ring');
}

function faceRig(group, { skin, ink, segments, y = 1.42, mood = 'stern' }) {
  const rig = new THREE.Group();
  rig.name = 'chronicles-face-rig';
  group.add(rig);
  add(rig, new THREE.SphereGeometry(0.22, segments, Math.max(12, segments / 2)), skin, [0, y, 0], [0, 0, 0], [1, 0.95, 0.92], 'chronicles-face');
  const z = 0.205;
  const browTilt = mood === 'stern' ? 0.36 : 0.18;
  add(rig, new THREE.SphereGeometry(0.024, 10, 8), ink, [-0.066, y + 0.012, z], [0, 0, 0], [1.2, 0.45, 0.38], 'chronicles-eye-left');
  add(rig, new THREE.SphereGeometry(0.024, 10, 8), ink, [0.066, y + 0.012, z], [0, 0, 0], [1.2, 0.45, 0.38], 'chronicles-eye-right');
  add(rig, new THREE.BoxGeometry(0.098, 0.018, 0.015), ink, [-0.06, y + 0.065, z + 0.004], [0, 0, -browTilt], null, 'chronicles-brow-left');
  add(rig, new THREE.BoxGeometry(0.098, 0.018, 0.015), ink, [0.06, y + 0.065, z + 0.004], [0, 0, browTilt], null, 'chronicles-brow-right');
  return rig;
}

function buildMatthias(segments) {
  const root = new THREE.Group();
  const ivory = material(0xd8cdbb, { metalness: 0.02, roughness: 0.72, clearcoat: 0.06 });
  const brass = material(0xb88936, { metalness: 0.78, roughness: 0.3, clearcoat: 0.24 });
  const coat = material(0x35302b, { roughness: 0.68, clearcoat: 0.04 });
  const wine = material(0x6f2f2d, { roughness: 0.72 });
  const leather = material(0x5a3822, { roughness: 0.82 });
  const skin = material(0xeee2d0, { metalness: 0, roughness: 0.86, clearcoat: 0.02 });
  const ink = material(0x090a0b, { metalness: 0, roughness: 0.9 });
  basePlinth(root, ivory, brass, segments);
  lathe(root, [[0.34, 0.34], [0.28, 0.54], [0.25, 0.83], [0.31, 1.06], [0.27, 1.18]], coat, segments, 'matthias-expedition-coat');
  add(root, new THREE.TorusGeometry(0.29, 0.024, 8, segments), brass, [0, 0.56, 0], [Math.PI / 2, 0, 0], null, 'matthias-expedition-belt');
  add(root, new THREE.BoxGeometry(0.1, 0.46, 0.025), wine, [-0.065, 0.83, 0.285], [0, 0, -0.42], null, 'matthias-expedition-sash');
  add(root, new THREE.BoxGeometry(0.24, 0.18, 0.1), leather, [0.31, 0.72, -0.02], [0, -0.24, 0], null, 'matthias-satchel');
  add(root, new THREE.CylinderGeometry(0.035, 0.035, 0.56, 8), leather, [-0.34, 0.82, 0.04], [0.12, 0, -0.18], null, 'matthias-map-case');
  faceRig(root, { skin, ink, segments, y: 1.39, mood: 'stern' });
  const cap = material(0x14181e, { metalness: 0.15, roughness: 0.5, clearcoat: 0.12 });
  add(root, new THREE.CylinderGeometry(0.245, 0.21, 0.12, segments), cap, [0, 1.57, 0], [0, 0, 0], [1.06, 1, 0.94], 'matthias-expedition-cap');
  add(root, new THREE.BoxGeometry(0.28, 0.028, 0.16), cap, [0, 1.515, 0.17], [-0.12, 0, 0], null, 'matthias-expedition-visor');
  add(root, new THREE.BoxGeometry(0.1, 0.055, 0.026), brass, [0, 1.57, 0.23], [0, 0, Math.PI / 4], null, 'matthias-expedition-cap-badge');
  root.userData.chroniclesCharacterId = 'matthias';
  root.userData.chroniclesSilhouette = 'pawn-chronist-expedition';
  return root;
}

function buildHildegard(segments) {
  const root = new THREE.Group();
  const stone = material(0x7f8588, { metalness: 0.28, roughness: 0.5, clearcoat: 0.1 });
  const steel = material(0xaeb4b7, { metalness: 0.72, roughness: 0.28, clearcoat: 0.22 });
  const dark = material(0x25292d, { metalness: 0.38, roughness: 0.46 });
  const cloth = material(0x39434a, { roughness: 0.76 });
  const ember = material(0x9c5d2f, { metalness: 0.24, roughness: 0.5 });
  basePlinth(root, stone, steel, segments);
  lathe(root, [[0.42, 0.35], [0.36, 0.58], [0.39, 0.9], [0.43, 1.12]], cloth, segments, 'hildegard-guard-body');
  add(root, new THREE.CylinderGeometry(0.42, 0.42, 0.26, segments), dark, [0, 1.17, 0], [0, 0, 0], null, 'hildegard-rook-helm');
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    add(root, new THREE.BoxGeometry(0.16, 0.18, 0.16), steel, [Math.cos(angle) * 0.31, 1.36, Math.sin(angle) * 0.31], [0, -angle, 0], null, `hildegard-crenel-${i}`);
  }
  add(root, new THREE.BoxGeometry(0.62, 0.72, 0.11), steel, [0.43, 0.78, 0.08], [0, -0.18, 0.02], null, 'hildegard-tower-shield');
  add(root, new THREE.BoxGeometry(0.42, 0.09, 0.06), ember, [0.43, 0.8, 0.145], [0, -0.18, 0], null, 'hildegard-shield-mark');
  add(root, new THREE.CylinderGeometry(0.07, 0.07, 0.72, 10), steel, [-0.42, 0.8, 0.02], [0, 0, -0.22], null, 'hildegard-mace-haft');
  add(root, new THREE.DodecahedronGeometry(0.16, 0), steel, [-0.5, 1.14, 0.03], [0, 0, 0], null, 'hildegard-mace-head');
  root.userData.chroniclesCharacterId = 'rook';
  root.userData.chroniclesSilhouette = 'rook-guardian';
  return root;
}

function buildAziz(segments) {
  const root = new THREE.Group();
  const sandstone = material(0xb9a47d, { metalness: 0.03, roughness: 0.78 });
  const brass = material(0xc29a45, { metalness: 0.75, roughness: 0.3, clearcoat: 0.2 });
  const robe = material(0x30423d, { roughness: 0.75 });
  const scarf = material(0x8c6736, { roughness: 0.7 });
  const glow = material(0xe6b55a, { metalness: 0.08, roughness: 0.34, emissive: 0xff8b20, emissiveIntensity: 1.8 });
  const skin = material(0xb8845f, { metalness: 0, roughness: 0.9 });
  const ink = material(0x0a0908, { metalness: 0, roughness: 0.9 });
  basePlinth(root, sandstone, brass, segments);
  lathe(root, [[0.4, 0.34], [0.32, 0.56], [0.28, 0.94], [0.31, 1.18]], robe, segments, 'aziz-bishop-robe');
  add(root, new THREE.BoxGeometry(0.11, 0.52, 0.025), scarf, [0.09, 0.86, 0.285], [0, 0, 0.48], null, 'aziz-diagonal-scarf');
  faceRig(root, { skin, ink, segments, y: 1.39, mood: 'calm' });
  add(root, new THREE.ConeGeometry(0.27, 0.46, segments), robe, [0, 1.68, 0], [0, 0, 0], null, 'aziz-split-mitre');
  add(root, new THREE.BoxGeometry(0.04, 0.34, 0.03), sandstone, [0, 1.72, 0.23], [0, 0, 0.38], null, 'aziz-mitre-split');
  add(root, new THREE.CylinderGeometry(0.035, 0.035, 0.8, 8), brass, [-0.42, 0.82, 0.02], [0.05, 0, -0.16], null, 'aziz-lantern-staff');
  add(root, new THREE.OctahedronGeometry(0.17, 0), glow, [-0.47, 1.22, 0.04], [0, 0, 0], null, 'aziz-lantern');
  root.userData.chroniclesCharacterId = 'bishop';
  root.userData.chroniclesSilhouette = 'bishop-lantern-seer';
  root.userData.chroniclesGlowMaterials = [glow];
  return root;
}

function buildMorcilla(segments) {
  const root = new THREE.Group();
  const bone = material(0x9c8f79, { metalness: 0.05, roughness: 0.78 });
  const iron = material(0x4d5358, { metalness: 0.56, roughness: 0.38 });
  const leather = material(0x65422b, { roughness: 0.82 });
  const cloth = material(0x3d3330, { roughness: 0.78 });
  const copper = material(0x9a6036, { metalness: 0.55, roughness: 0.36 });
  basePlinth(root, bone, iron, segments);
  lathe(root, [[0.38, 0.34], [0.31, 0.54], [0.28, 0.86], [0.32, 1.08]], cloth, segments, 'morcilla-logistics-body');
  const neck = new THREE.Group();
  neck.position.set(0, 1.05, 0);
  neck.rotation.x = -0.08;
  root.add(neck);
  add(neck, new THREE.CylinderGeometry(0.19, 0.24, 0.48, segments), bone, [0, 0.22, 0], [0.28, 0, 0], null, 'morcilla-knight-neck');
  add(neck, new THREE.SphereGeometry(0.25, segments, Math.max(12, segments / 2)), bone, [0, 0.46, 0.12], [0, 0, 0], [0.92, 0.82, 1.25], 'morcilla-knight-head');
  add(neck, new THREE.ConeGeometry(0.065, 0.26, 8), bone, [-0.13, 0.69, 0.05], [0.16, 0, 0.08], null, 'morcilla-ear-left');
  add(neck, new THREE.ConeGeometry(0.065, 0.26, 8), bone, [0.13, 0.69, 0.05], [0.16, 0, -0.08], null, 'morcilla-ear-right');
  add(neck, new THREE.BoxGeometry(0.28, 0.12, 0.12), iron, [0, 0.48, 0.27], [0.12, 0, 0], null, 'morcilla-brow-plate');
  add(root, new THREE.BoxGeometry(0.3, 0.38, 0.18), leather, [-0.35, 0.78, -0.04], [0, 0.12, 0], null, 'morcilla-pack-left');
  add(root, new THREE.BoxGeometry(0.3, 0.38, 0.18), leather, [0.35, 0.78, -0.04], [0, -0.12, 0], null, 'morcilla-pack-right');
  add(root, new THREE.CylinderGeometry(0.055, 0.055, 0.6, 8), copper, [0.4, 0.92, 0.04], [0, 0, 0.12], null, 'morcilla-tool-roll');
  root.userData.chroniclesCharacterId = 'knight';
  root.userData.chroniclesSilhouette = 'knight-quartermaster';
  return root;
}

export function buildChroniclesCharacter(memberId, { coarsePointer = false } = {}) {
  const segments = coarsePointer ? 18 : 30;
  if (memberId === 'rook') return buildHildegard(segments);
  if (memberId === 'bishop') return buildAziz(segments);
  if (memberId === 'knight') return buildMorcilla(segments);
  return buildMatthias(segments);
}

export function buildCorruptedPawn({ coarsePointer = false } = {}) {
  const segments = coarsePointer ? 18 : 30;
  const root = new THREE.Group();
  root.name = 'chronicles-corrupted-pawn';
  root.userData.chroniclesEnemy = 'corrupted-pawn';
  const iron = material(0x191a1c, { metalness: 0.48, roughness: 0.38, clearcoat: 0.18 });
  const crust = material(0x322421, { metalness: 0.2, roughness: 0.72 });
  const glow = material(0x3a0708, { metalness: 0.08, roughness: 0.42, emissive: 0xd0161b, emissiveIntensity: 1.7 });
  basePlinth(root, crust, iron, segments);
  lathe(root, [[0.35, 0.34], [0.29, 0.54], [0.27, 0.82], [0.35, 1.06], [0.29, 1.18]], iron, segments, 'corrupted-pawn-body');
  add(root, new THREE.TorusGeometry(0.3, 0.035, 8, segments), glow, [0, 0.75, 0], [Math.PI / 2, 0, 0], null, 'corrupted-pawn-fissure-ring');
  add(root, new THREE.SphereGeometry(0.31, segments, Math.max(12, segments / 2)), iron, [0, 1.44, 0], [0, 0, 0], [1, 0.92, 0.92], 'corrupted-pawn-head');
  add(root, new THREE.BoxGeometry(0.08, 0.035, 0.035), glow, [-0.095, 1.47, 0.29], [0, 0, -0.24], null, 'corrupted-pawn-eye-left');
  add(root, new THREE.BoxGeometry(0.08, 0.035, 0.035), glow, [0.095, 1.47, 0.29], [0, 0, 0.24], null, 'corrupted-pawn-eye-right');
  add(root, new THREE.ConeGeometry(0.1, 0.44, 7), crust, [-0.26, 1.2, -0.04], [0.1, 0, -0.72], null, 'corrupted-pawn-spike-left');
  add(root, new THREE.ConeGeometry(0.08, 0.36, 7), crust, [0.28, 1.12, -0.08], [-0.1, 0, 0.82], null, 'corrupted-pawn-spike-right');
  add(root, new THREE.BoxGeometry(0.05, 0.58, 0.03), glow, [0.03, 0.91, 0.28], [0, 0, -0.12], null, 'corrupted-pawn-chest-fissure');
  root.userData.chroniclesGlowMaterials = [glow];
  root.userData.chroniclesBaseGlow = 1.7;
  return root;
}

export function buildGateJailer({ coarsePointer = false } = {}) {
  const segments = coarsePointer ? 18 : 30;
  const root = new THREE.Group();
  root.name = 'chronicles-gate-jailer';
  root.userData.chroniclesEnemy = 'gate-jailer';

  const blackIron = material(0x17191b, { metalness: 0.66, roughness: 0.34, clearcoat: 0.14 });
  const oldSteel = material(0x55595a, { metalness: 0.72, roughness: 0.32, clearcoat: 0.12 });
  const crust = material(0x352722, { metalness: 0.18, roughness: 0.78 });
  const glow = material(0x4a0b09, { metalness: 0.08, roughness: 0.38, emissive: 0xe3311d, emissiveIntensity: 2.05 });

  basePlinth(root, crust, blackIron, segments);
  lathe(root, [
    [0.5, 0.34], [0.48, 0.48], [0.44, 0.72], [0.48, 1.02], [0.5, 1.28],
  ], blackIron, segments, 'gate-jailer-tower-body');
  add(root, new THREE.TorusGeometry(0.46, 0.045, 8, segments), oldSteel, [0, 0.56, 0], [Math.PI / 2, 0, 0], null, 'gate-jailer-iron-band-low');
  add(root, new THREE.TorusGeometry(0.49, 0.05, 8, segments), oldSteel, [0, 1.14, 0], [Math.PI / 2, 0, 0], null, 'gate-jailer-iron-band-high');

  const crown = new THREE.Group();
  crown.name = 'gate-jailer-crown';
  root.add(crown);
  add(crown, new THREE.CylinderGeometry(0.5, 0.47, 0.23, segments), blackIron, [0, 1.34, 0], [0, 0, 0], null, 'gate-jailer-crown-drum');
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const radial = 0.39;
    add(
      crown,
      new THREE.BoxGeometry(0.17, 0.26, 0.18),
      i % 2 ? oldSteel : blackIron,
      [Math.cos(angle) * radial, 1.52, Math.sin(angle) * radial],
      [0, -angle, 0],
      null,
      `gate-jailer-crenel-${i}`,
    );
  }

  add(root, new THREE.BoxGeometry(0.52, 0.065, 0.04), glow, [0, 0.92, 0.455], [0, 0, 0.12], null, 'gate-jailer-fissure-main');
  add(root, new THREE.BoxGeometry(0.32, 0.045, 0.035), glow, [-0.12, 1.04, 0.465], [0, 0, -0.58], null, 'gate-jailer-fissure-diagonal');
  add(root, new THREE.BoxGeometry(0.12, 0.055, 0.04), glow, [-0.16, 1.39, 0.47], [0, 0, -0.12], null, 'gate-jailer-eye-left');
  add(root, new THREE.BoxGeometry(0.12, 0.055, 0.04), glow, [0.16, 1.39, 0.47], [0, 0, 0.12], null, 'gate-jailer-eye-right');

  const chainMat = oldSteel;
  for (let i = 0; i < (coarsePointer ? 3 : 5); i += 1) {
    const link = add(
      root,
      new THREE.TorusGeometry(0.09, 0.022, 6, coarsePointer ? 10 : 14),
      chainMat,
      [0.52, 1.05 - i * 0.17, 0.03],
      [Math.PI / 2, 0, i % 2 ? Math.PI / 2 : 0],
      null,
      `gate-jailer-chain-${i}`,
    );
    link.scale.y = 1.3;
  }

  add(root, new THREE.BoxGeometry(0.18, 0.64, 0.12), oldSteel, [-0.52, 0.85, 0], [0, 0, -0.08], null, 'gate-jailer-key-blade');
  add(root, new THREE.TorusGeometry(0.18, 0.045, 8, segments), oldSteel, [-0.54, 1.19, 0], [Math.PI / 2, 0, 0], null, 'gate-jailer-key-ring');

  root.userData.chroniclesGlowMaterials = [glow];
  root.userData.chroniclesBaseGlow = 2.05;
  root.userData.chroniclesSilhouette = 'corrupted-rook-jailer';
  return root;
}
