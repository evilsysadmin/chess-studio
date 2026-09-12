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
  tournament: Object.freeze({ x: -0.62, y: 0.105, z: 0.27 }),
  train: Object.freeze({ x: -0.255, y: 0.035, z: 0.285 }),
  play: Object.freeze({ x: 0, y: -0.22, z: 0.31 }),
  daily: Object.freeze({ x: 0.86, y: -0.015, z: 0.3 }),
});

export const HOME_CASTLE_DUST_MOTE_COUNT = 24;

const DESTINATION_PROP_REFERENCE_ASPECT = 1.6;

export function homeCastleDestinationPropScale(aspect, visibleWidthRatio = 1) {
  const numericAspect = Number(aspect);
  const numericVisibleRatio = Number(visibleWidthRatio);
  const aspectScale = Number.isFinite(numericAspect) && numericAspect > 0
    ? numericAspect / DESTINATION_PROP_REFERENCE_ASPECT
    : 1;
  const visibleScale = Number.isFinite(numericVisibleRatio) && numericVisibleRatio > 0
    ? numericVisibleRatio
    : 1;
  return THREE.MathUtils.clamp(Math.min(aspectScale, visibleScale), 0.28, 1);
}

function attachViewportScale(group, driverMesh, baseScale) {
  group.userData.baseScale = baseScale;
  group.scale.setScalar(baseScale);
  driverMesh.onBeforeRender = (renderer, _scene, camera) => {
    const cameraWidth = Math.abs((camera?.right ?? 0) - (camera?.left ?? 0));
    const cameraHeight = Math.abs((camera?.top ?? 0) - (camera?.bottom ?? 0));
    const cameraAspect = cameraHeight > 0
      ? cameraWidth / cameraHeight
      : DESTINATION_PROP_REFERENCE_ASPECT;
    const canvas = renderer?.domElement;
    const canvasRect = canvas?.getBoundingClientRect?.();
    const canvasWidth = Math.max(1, canvasRect?.width || canvas?.clientWidth || 1);
    const view = canvas?.ownerDocument?.defaultView
      || (typeof window !== 'undefined' ? window : null);
    const viewportWidth = Math.max(1, view?.innerWidth || canvasWidth);
    const viewportHeight = Math.max(1, view?.innerHeight || (canvasWidth / cameraAspect));
    const viewportAspect = viewportWidth / viewportHeight;
    const visibleWidthRatio = Math.min(1, viewportWidth / canvasWidth);
    const responsiveScale = homeCastleDestinationPropScale(viewportAspect, visibleWidthRatio);
    group.scale.setScalar(baseScale * responsiveScale);
  };
}

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

function createTournamentTrophy(resources) {
  const group = new THREE.Group();
  group.name = 'home-castle-prop-tournament';
  group.userData.destination = 'tournament';
  group.position.set(
    HOME_CASTLE_DESTINATION_PROP_ANCHORS.tournament.x,
    HOME_CASTLE_DESTINATION_PROP_ANCHORS.tournament.y,
    HOME_CASTLE_DESTINATION_PROP_ANCHORS.tournament.z,
  );

  const brass = new THREE.MeshStandardMaterial({
    color: 0xd4a94f,
    roughness: 0.42,
    metalness: 0.58,
    emissive: 0x372006,
    emissiveIntensity: 0.07,
  });
  const darkWood = new THREE.MeshStandardMaterial({
    color: 0x4e2e1a,
    roughness: 0.82,
    metalness: 0.02,
    emissive: 0x100703,
    emissiveIntensity: 0.025,
  });
  resources.materials.push(brass, darkWood);

  const plinthGeometry = new THREE.BoxGeometry(0.11, 0.025, 0.07);
  const footGeometry = new THREE.CylinderGeometry(0.027, 0.035, 0.022, 18);
  const stemGeometry = new THREE.CylinderGeometry(0.011, 0.017, 0.045, 14);
  const bowlGeometry = new THREE.CylinderGeometry(0.047, 0.027, 0.052, 20);
  const lipGeometry = new THREE.TorusGeometry(0.043, 0.004, 8, 22);
  const handleGeometry = new THREE.TorusGeometry(0.027, 0.004, 7, 18);
  resources.geometries.push(
    plinthGeometry,
    footGeometry,
    stemGeometry,
    bowlGeometry,
    lipGeometry,
    handleGeometry,
  );

  const plinth = new THREE.Mesh(plinthGeometry, darkWood);
  plinth.position.y = 0.012;
  const foot = new THREE.Mesh(footGeometry, brass);
  foot.position.y = 0.035;
  const stem = new THREE.Mesh(stemGeometry, brass);
  stem.position.y = 0.067;
  const bowl = new THREE.Mesh(bowlGeometry, brass);
  bowl.position.y = 0.112;
  const lip = new THREE.Mesh(lipGeometry, brass);
  lip.position.y = 0.139;
  lip.rotation.x = Math.PI / 2;

  const leftHandle = new THREE.Mesh(handleGeometry, brass);
  leftHandle.position.set(-0.049, 0.114, 0);
  leftHandle.scale.set(0.72, 0.9, 0.72);
  const rightHandle = new THREE.Mesh(handleGeometry, brass);
  rightHandle.position.set(0.049, 0.114, 0);
  rightHandle.scale.set(0.72, 0.9, 0.72);

  group.add(plinth, foot, stem, bowl, lip, leftHandle, rightHandle);
  attachViewportScale(group, plinth, 0.68);
  return group;
}

function createTrainingLectern(resources) {
  const group = new THREE.Group();
  group.name = 'home-castle-prop-train';
  group.userData.destination = 'train';
  group.position.set(
    HOME_CASTLE_DESTINATION_PROP_ANCHORS.train.x,
    HOME_CASTLE_DESTINATION_PROP_ANCHORS.train.y,
    HOME_CASTLE_DESTINATION_PROP_ANCHORS.train.z,
  );

  const wood = new THREE.MeshStandardMaterial({
    color: 0x684022,
    roughness: 0.84,
    metalness: 0.015,
    emissive: 0x160a04,
    emissiveIntensity: 0.025,
  });
  const page = new THREE.MeshStandardMaterial({
    color: 0xd8c99f,
    roughness: 0.9,
    metalness: 0,
    emissive: 0x2c2110,
    emissiveIntensity: 0.055,
  });
  const cover = new THREE.MeshStandardMaterial({
    color: 0x5d231d,
    roughness: 0.76,
    metalness: 0.01,
    emissive: 0x160604,
    emissiveIntensity: 0.025,
  });
  resources.materials.push(wood, page, cover);

  const baseGeometry = new THREE.BoxGeometry(0.095, 0.018, 0.064);
  const postGeometry = new THREE.BoxGeometry(0.018, 0.105, 0.022);
  const deskGeometry = new THREE.BoxGeometry(0.14, 0.016, 0.085);
  const bookGeometry = new THREE.BoxGeometry(0.064, 0.009, 0.074);
  const spineGeometry = new THREE.BoxGeometry(0.009, 0.011, 0.076);
  resources.geometries.push(baseGeometry, postGeometry, deskGeometry, bookGeometry, spineGeometry);

  const base = new THREE.Mesh(baseGeometry, wood);
  base.position.y = 0.009;
  const post = new THREE.Mesh(postGeometry, wood);
  post.position.y = 0.068;
  const desk = new THREE.Mesh(deskGeometry, wood);
  desk.position.set(0, 0.132, -0.002);
  desk.rotation.x = -0.43;

  const leftCover = new THREE.Mesh(bookGeometry, cover);
  leftCover.position.set(-0.032, 0.145, 0.008);
  leftCover.rotation.set(-0.43, 0.13, 0);
  const rightCover = new THREE.Mesh(bookGeometry, cover);
  rightCover.position.set(0.032, 0.145, 0.008);
  rightCover.rotation.set(-0.43, -0.13, 0);

  const leftPage = new THREE.Mesh(bookGeometry, page);
  leftPage.position.set(-0.031, 0.151, 0.012);
  leftPage.scale.set(0.94, 0.5, 0.94);
  leftPage.rotation.set(-0.43, 0.13, 0);
  const rightPage = new THREE.Mesh(bookGeometry, page);
  rightPage.position.set(0.031, 0.151, 0.012);
  rightPage.scale.set(0.94, 0.5, 0.94);
  rightPage.rotation.set(-0.43, -0.13, 0);

  const spine = new THREE.Mesh(spineGeometry, cover);
  spine.position.set(0, 0.148, 0.01);
  spine.rotation.x = -0.43;

  group.add(base, post, desk, leftCover, rightCover, leftPage, rightPage, spine);
  attachViewportScale(group, base, 0.7);
  return group;
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
  group.rotation.x = -0.035;

  const warmIvory = new THREE.MeshStandardMaterial({
    color: 0xead9b2,
    roughness: 0.68,
    metalness: 0.06,
    emissive: 0x3a2714,
    emissiveIntensity: 0.085,
  });
  const agedBase = new THREE.MeshStandardMaterial({
    color: 0x9a784c,
    roughness: 0.76,
    metalness: 0.05,
    emissive: 0x1d1208,
    emissiveIntensity: 0.04,
  });
  resources.materials.push(warmIvory, agedBase);

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

  const base = new THREE.Mesh(baseGeometry, agedBase);
  base.position.y = 0.009;
  const foot = new THREE.Mesh(footGeometry, warmIvory);
  foot.position.y = 0.026;
  const body = new THREE.Mesh(bodyGeometry, warmIvory);
  body.position.y = 0.059;
  const collar = new THREE.Mesh(collarGeometry, agedBase);
  collar.position.y = 0.093;
  const crown = new THREE.Mesh(crownGeometry, warmIvory);
  crown.position.y = 0.11;

  group.add(base, foot, body, collar, crown);

  for (const x of [-0.022, 0.022]) {
    for (const z of [-0.014, 0.014]) {
      const merlon = new THREE.Mesh(merlonGeometry, warmIvory);
      merlon.position.set(x, 0.129, z);
      group.add(merlon);
    }
  }

  attachViewportScale(group, base, 0.82);
  return group;
}

function createDailyBrazier(resources) {
  const group = new THREE.Group();
  group.name = 'home-castle-prop-daily';
  group.userData.destination = 'daily';
  group.position.set(
    HOME_CASTLE_DESTINATION_PROP_ANCHORS.daily.x,
    HOME_CASTLE_DESTINATION_PROP_ANCHORS.daily.y,
    HOME_CASTLE_DESTINATION_PROP_ANCHORS.daily.z,
  );
  group.rotation.x = -0.025;

  const bronze = new THREE.MeshStandardMaterial({
    color: 0x8c5c2c,
    roughness: 0.62,
    metalness: 0.34,
    emissive: 0x1e0d02,
    emissiveIntensity: 0.05,
  });
  const flameOuter = new THREE.MeshBasicMaterial({
    color: 0xff9d3b,
    transparent: true,
    opacity: 0.76,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const flameInner = new THREE.MeshBasicMaterial({
    color: 0xffd37a,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  resources.materials.push(bronze, flameOuter, flameInner);

  const footGeometry = new THREE.CylinderGeometry(0.025, 0.032, 0.012, 18);
  const stemGeometry = new THREE.CylinderGeometry(0.009, 0.014, 0.035, 14);
  const bowlGeometry = new THREE.CylinderGeometry(0.044, 0.031, 0.02, 20);
  const rimGeometry = new THREE.TorusGeometry(0.039, 0.004, 8, 24);
  const flameGeometry = new THREE.ConeGeometry(0.021, 0.07, 14);
  const coreGeometry = new THREE.ConeGeometry(0.012, 0.045, 12);
  resources.geometries.push(
    footGeometry,
    stemGeometry,
    bowlGeometry,
    rimGeometry,
    flameGeometry,
    coreGeometry,
  );

  const foot = new THREE.Mesh(footGeometry, bronze);
  foot.position.y = 0.006;
  const stem = new THREE.Mesh(stemGeometry, bronze);
  stem.position.y = 0.027;
  const bowl = new THREE.Mesh(bowlGeometry, bronze);
  bowl.position.y = 0.052;
  const rim = new THREE.Mesh(rimGeometry, bronze);
  rim.position.y = 0.063;
  rim.rotation.x = Math.PI / 2;

  const flame = new THREE.Mesh(flameGeometry, flameOuter);
  flame.position.y = 0.102;
  flame.scale.set(0.78, 1, 0.62);
  flame.name = 'home-castle-daily-flame';
  const core = new THREE.Mesh(coreGeometry, flameInner);
  core.position.y = 0.097;
  core.scale.set(0.68, 0.9, 0.54);

  group.add(foot, stem, bowl, rim, flame, core);
  attachViewportScale(group, bowl, 0.78);
  return group;
}

export function createHomeCastleDestinationProps() {
  const group = new THREE.Group();
  group.name = 'home-castle-destination-props';

  const resources = {
    geometries: [],
    materials: [],
  };
  const tournament = createTournamentTrophy(resources);
  const train = createTrainingLectern(resources);
  const play = createPlayRook(resources);
  const daily = createDailyBrazier(resources);
  group.add(tournament, train, play, daily);

  return {
    group,
    tournament,
    train,
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
