import * as THREE from 'three';

function physical(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0,
    roughness: options.roughness ?? 0.78,
    clearcoat: options.clearcoat ?? 0.05,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.52,
    specularIntensity: options.specularIntensity ?? 0.2,
  });
}

function addMesh(group, geometry, material, position, rotation = [0, 0, 0], name = '') {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

function addBox(group, size, material, position, name = '') {
  return addMesh(group, new THREE.BoxGeometry(...size), material, position, [0, 0, 0], name);
}

function addDispatchCase(consoleGroup, materials) {
  const props = new THREE.Group();
  props.name = 'war-room-lived-in-dispatch-case';
  props.userData.warRoomLivedInProp = 'field-dispatch-case';

  addBox(props, [0.64, 0.14, 0.46], materials.leather, [0.38, 1.105, 0.14], 'war-room-dispatch-case-base');
  addBox(props, [0.66, 0.045, 0.48], materials.leatherHighlight, [0.38, 1.198, 0.14], 'war-room-dispatch-case-lid');
  addBox(props, [0.06, 0.035, 0.5], materials.strap, [0.38, 1.228, 0.14], 'war-room-dispatch-case-strap');
  addBox(props, [0.11, 0.075, 0.025], materials.brass, [0.38, 1.16, 0.39], 'war-room-dispatch-case-clasp');

  consoleGroup.add(props);
  return 4;
}

function addUsedMug(consoleGroup, materials) {
  const props = new THREE.Group();
  props.name = 'war-room-lived-in-mug';
  props.userData.warRoomLivedInProp = 'used-field-mug';

  addMesh(
    props,
    new THREE.CylinderGeometry(0.13, 0.115, 0.22, 18),
    materials.pewter,
    [-0.38, 1.14, 0.2],
    [0, 0, 0],
    'war-room-field-mug-body',
  );
  addMesh(
    props,
    new THREE.TorusGeometry(0.105, 0.026, 8, 18),
    materials.pewter,
    [-0.25, 1.14, 0.2],
    [0, 0, 0],
    'war-room-field-mug-handle',
  );
  addMesh(
    props,
    new THREE.CylinderGeometry(0.108, 0.108, 0.008, 18),
    materials.coffee,
    [-0.38, 1.254, 0.2],
    [0, 0, 0],
    'war-room-field-mug-coffee',
  );

  consoleGroup.add(props);
  return 3;
}

function addMapTube(consoleGroup, materials) {
  const props = new THREE.Group();
  props.name = 'war-room-lived-in-map-tube';
  props.userData.warRoomLivedInProp = 'sealed-map-tube';

  addMesh(
    props,
    new THREE.CylinderGeometry(0.075, 0.075, 0.6, 16),
    materials.tubeLeather,
    [0.36, 1.1, -0.08],
    [Math.PI / 2, 0, 0.12],
    'war-room-map-tube-body',
  );
  addMesh(
    props,
    new THREE.CylinderGeometry(0.087, 0.087, 0.035, 16),
    materials.brassDark,
    [0.32, 1.1, -0.38],
    [Math.PI / 2, 0, 0.12],
    'war-room-map-tube-cap',
  );
  addMesh(
    props,
    new THREE.CylinderGeometry(0.087, 0.087, 0.035, 16),
    materials.brassDark,
    [0.4, 1.1, 0.22],
    [Math.PI / 2, 0, 0.12],
    'war-room-map-tube-cap',
  );

  consoleGroup.add(props);
  return 3;
}

export function installWarRoomArchitecturalPatina(group, { coarsePointer = false } = {}) {
  if (!group || coarsePointer || group.userData.warRoomLivedInPatina === 'v7-asymmetric-field-use') return 0;

  const left = group.getObjectByName?.('war-room-side-console-left');
  const right = group.getObjectByName?.('war-room-side-console-right');
  if (!left || !right) return 0;

  const materials = {
    leather: physical(0x2b1713, { roughness: 0.7, clearcoat: 0.09, specularIntensity: 0.22 }),
    leatherHighlight: physical(0x4a2820, { roughness: 0.66, clearcoat: 0.11, specularIntensity: 0.24 }),
    strap: physical(0x1d1110, { roughness: 0.82, clearcoat: 0.025, specularIntensity: 0.14 }),
    brass: physical(0x9a7131, { metalness: 0.76, roughness: 0.36, clearcoat: 0.14, specularIntensity: 0.58 }),
    brassDark: physical(0x64451f, { metalness: 0.68, roughness: 0.43, clearcoat: 0.1, specularIntensity: 0.46 }),
    pewter: physical(0x777b7b, { metalness: 0.66, roughness: 0.48, clearcoat: 0.08, specularIntensity: 0.5 }),
    coffee: physical(0x21100b, { roughness: 0.46, clearcoat: 0.2, clearcoatRoughness: 0.25, specularIntensity: 0.3 }),
    tubeLeather: physical(0x4a2b1d, { roughness: 0.74, clearcoat: 0.06, specularIntensity: 0.18 }),
  };

  let count = 0;
  count += addDispatchCase(left, materials);
  count += addUsedMug(right, materials);
  count += addMapTube(right, materials);

  left.userData.warRoomLivedInSide = 'dispatch-work';
  right.userData.warRoomLivedInSide = 'drink-and-maps';
  group.userData.warRoomLivedInPatina = 'v7-asymmetric-field-use';
  group.userData.warRoomLivedInPropCount = count;
  return count;
}
