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

export const HOME_CASTLE_DESTINATION_PROP_ANCHORS = Object.freeze({
  play: Object.freeze({ x: 0, y: -0.34, z: 0.34 }),
  daily: Object.freeze({ x: 0.86, y: 0.01, z: 0.31 }),
});

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

function createPlayRook(resources) {
  const group = new THREE.Group();
  group.name = 'home-castle-prop-play';
  group.userData.destination = 'play';
  group.position.set(
    HOME_CASTLE_DESTINATION_PROP_ANCHORS.play.x,
    HOME_CASTLE_DESTINATION_PROP_ANCHORS.play.y,
    HOME_CASTLE_DESTINATION_PROP_ANCHORS.play.z,
  );
  group.rotation.x = -0.04;

  const brass = new THREE.MeshStandardMaterial({
    color: 0xd2aa61,
    roughness: 0.42,
    metalness: 0.52,
    emissive: 0x2a1605,
    emissiveIntensity: 0.08,
  });
  const darkBrass = new THREE.MeshStandardMaterial({
    color: 0x7d5429,
    roughness: 0.55,
    metalness: 0.38,
    emissive: 0x160b03,
    emissiveIntensity: 0.04,
  });
  resources.materials.push(brass, darkBrass);

  const baseGeometry = new THREE.CylinderGeometry(0.046, 0.052, 0.018, 18);
  const footGeometry = new THREE.CylinderGeometry(0.038, 0.045, 0.016, 18);
  const bodyGeometry = new THREE.CylinderGeometry(0.023, 0.031, 0.054, 18);
  const collarGeometry = new THREE.CylinderGeometry(0.033, 0.027, 0.014, 18);
  const crownGeometry = new THREE.CylinderGeometry(0.038, 0.036, 0.022, 18);
  const merlonGeometry = new THREE.BoxGeometry(0.018, 0.018, 0.018);
  resources.geometries.push(
    baseGeometry,
    footGeometry,
    bodyGeometry,
    collarGeometry,
    crownGeometry,
    merlonGeometry,
  );

  const base = new THREE.Mesh(baseGeometry, darkBrass);
  base.position.y = 0.009;
  const foot = new THREE.Mesh(footGeometry, brass);
  foot.position.y = 0.026;
  const body = new THREE.Mesh(bodyGeometry, brass);
  body.position.y = 0.059;
  const collar = new THREE.Mesh(collarGeometry, darkBrass);
  collar.position.y = 0.093;
  const crown = new THREE.Mesh(crownGeometry, brass);
  crown.position.y = 0.11;

  group.add(base, foot, body, collar, crown);

  for (const x of [-0.022, 0.022]) {
    for (const z of [-0.014, 0.014]) {
      const merlon = new THREE.Mesh(merlonGeometry, brass);
      merlon.position.set(x, 0.129, z);
      group.add(merlon);
    }
  }

  group.scale.setScalar(0.95);
  return group;
}

function createDailyHourglass(resources) {
  const group = new THREE.Group();
  group.name = 'home-castle-prop-daily';
  group.userData.destination = 'daily';
  group.position.set(
    HOME_CASTLE_DESTINATION_PROP_ANCHORS.daily.x,
    HOME_CASTLE_DESTINATION_PROP_ANCHORS.daily.y,
    HOME_CASTLE_DESTINATION_PROP_ANCHORS.daily.z,
  );
  group.rotation.z = -0.055;

  const frame = new THREE.MeshStandardMaterial({
    color: 0xbc8642,
    roughness: 0.48,
    metalness: 0.45,
    emissive: 0x2a1303,
    emissiveIntensity: 0.06,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xffddb0,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const sand = new THREE.MeshStandardMaterial({
    color: 0xe6a33d,
    roughness: 0.7,
    metalness: 0,
    emissive: 0x9a4a08,
    emissiveIntensity: 0.18,
  });
  resources.materials.push(frame, glass, sand);

  const capGeometry = new THREE.CylinderGeometry(0.034, 0.034, 0.012, 18);
  const postGeometry = new THREE.CylinderGeometry(0.0045, 0.0045, 0.083, 10);
  const glassGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.073, 16);
  const sandGeometry = new THREE.ConeGeometry(0.019, 0.032, 14);
  resources.geometries.push(capGeometry, postGeometry, glassGeometry, sandGeometry);

  const bottom = new THREE.Mesh(capGeometry, frame);
  bottom.position.y = 0.006;
  const top = new THREE.Mesh(capGeometry, frame);
  top.position.y = 0.094;
  group.add(bottom, top);

  for (const x of [-0.027, 0.027]) {
    const post = new THREE.Mesh(postGeometry, frame);
    post.position.set(x, 0.05, 0);
    group.add(post);
  }

  const glassBody = new THREE.Mesh(glassGeometry, glass);
  glassBody.position.y = 0.05;
  glassBody.scale.set(0.88, 1, 0.62);
  group.add(glassBody);

  const upperSand = new THREE.Mesh(sandGeometry, sand);
  upperSand.position.y = 0.067;
  upperSand.rotation.z = Math.PI;
  upperSand.scale.set(0.8, 0.72, 0.58);
  const lowerSand = new THREE.Mesh(sandGeometry, sand);
  lowerSand.position.y = 0.033;
  lowerSand.scale.set(0.72, 0.6, 0.54);
  group.add(upperSand, lowerSand);

  group.scale.setScalar(1.02);
  return group;
}

export function createHomeCastleDestinationProps() {
  const group = new THREE.Group();
  group.name = 'home-castle-destination-props';

  const resources = {
    geometries: [],
    materials: [],
  };
  const play = createPlayRook(resources);
  const daily = createDailyHourglass(resources);
  group.add(play, daily);

  return {
    group,
    play,
    daily,
    dispose() {
      for (const geometry of resources.geometries) geometry.dispose();
      for (const material of resources.materials) material.dispose();
    },
  };
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

  const destinationProps = createHomeCastleDestinationProps();
  group.add(destinationProps.group);

  return {
    group,
    flames,
    dust: dustLayer.dust,
    destinationProps,
    dispose() {
      flameGeometry.dispose();
      flameMaterial.dispose();
      dustLayer.geometry.dispose();
      dustLayer.material.dispose();
      destinationProps.dispose();
    },
  };
}
