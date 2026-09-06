import './components/ChesscomCanonical.css';
import {
  BABYLON_VERSION,
  createChesscomBabylon as createGpuChesscomBabylon,
  loadChesscomBabylon,
} from './chesscomBabylonGpu.js';
import {
  CHESSCOM_CANONICAL_LIGHTS,
  CHESSCOM_CANONICAL_PUDDLES,
  CHESSCOM_CANONICAL_SCENE,
  chesscomCanonicalQualityProfile,
} from './chesscomCanonicalProfile.js';
import { installChesscomUnitCombatCanonical } from './chesscomUnitCombatCanonical.js';
import { installChesscomOperatorV3 } from './chesscomOperatorV3.js';

const HARD_WET_SURFACES = new Set(['ground','tile','road','concrete']);
const METAL_SURFACES = new Set([
  'roof','roof-trim','door','metal','metal-bright','metal-dark','barrel','barrel-top','truck',
  'gun','friendly-armour','enemy-armour','helmet','elite-helmet','matthias-black','matthias-black-2','matthias-brass',
]);
const SOFT_SURFACES = new Set(['wood','wood-light','sandbag','fabric','friendly-body','enemy-body','pack','boot','glove','pouch','tire']);

function sceneFromBabylon(B) {
  return B.EngineStore?.LastCreatedScene
    || B.EngineStore?.Instances?.at?.(-1)?.scenes?.at?.(-1)
    || null;
}

function tuneMaterial(B, mat, profile) {
  if (!mat || !('specularColor' in mat)) return;
  const name = String(mat.name || '');
  if (HARD_WET_SURFACES.has(name)) {
    mat.specularColor = new B.Color3(.34 * profile.wetness, .39 * profile.wetness, .43 * profile.wetness);
    mat.specularPower = name === 'road' ? 118 : 96;
    if ('diffuseColor' in mat && name !== 'tile') mat.diffuseColor.scaleInPlace(.93);
    return;
  }
  if (METAL_SURFACES.has(name)) {
    mat.specularColor = name === 'matthias-brass'
      ? new B.Color3(.62,.48,.22)
      : new B.Color3(.28,.31,.33);
    mat.specularPower = name === 'matthias-brass' ? 132 : 110;
    return;
  }
  if (SOFT_SURFACES.has(name)) {
    mat.specularColor = new B.Color3(.045,.05,.052);
    mat.specularPower = 18;
  }
}

function tuneScene(B, scene, profile) {
  scene.clearColor = new B.Color4(.006,.011,.014,1);
  scene.fogMode = B.Scene.FOGMODE_EXP2;
  scene.fogDensity = profile.fogDensity;
  scene.fogColor = new B.Color3(.018,.029,.038);
  const image = scene.imageProcessingConfiguration;
  if (image) {
    image.contrast = profile.contrast;
    image.exposure = profile.exposure;
    image.toneMappingEnabled = true;
    if (typeof B.ImageProcessingConfiguration?.TONEMAPPING_ACES !== 'undefined') {
      image.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
    }
    image.vignetteEnabled = true;
    image.vignetteWeight = .93;
    image.vignetteStretch = .12;
    image.vignetteColor = new B.Color4(.002,.006,.009,1);
  }
  scene.materials.forEach((mat) => tuneMaterial(B, mat, profile));

  const warmA = scene.getLightByName?.('warm-a');
  if (warmA) {
    warmA.diffuse = new B.Color3(1,.47,.16);
    warmA.intensity = Math.min(Number(warmA.intensity) || 0, 10.4);
  }
  const warmB = scene.getLightByName?.('warm-b');
  if (warmB) {
    warmB.diffuse = new B.Color3(1,.40,.12);
    warmB.intensity = Math.min(Number(warmB.intensity) || 0, 9.3);
  }
  const coolFill = scene.getLightByName?.('cool-fill');
  if (coolFill) {
    coolFill.diffuse = new B.Color3(.16,.34,.48);
    coolFill.intensity = Math.min(Number(coolFill.intensity) || 0, 2.55);
  }
}

function createPuddleTexture(B, scene, disposables) {
  const texture = new B.DynamicTexture('chesscom-canonical-puddle-mask', { width:128,height:128 }, scene, false);
  texture.hasAlpha = true;
  texture.wrapU = B.Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = B.Texture.CLAMP_ADDRESSMODE;
  const ctx = texture.getContext();
  ctx.clearRect(0,0,128,128);
  const gradients = [
    [64,64,52,.62],
    [44,61,31,.46],
    [83,69,27,.42],
  ];
  for (const [x,y,r,a] of gradients) {
    const g = ctx.createRadialGradient(x,y,3,x,y,r);
    g.addColorStop(0,`rgba(214,232,239,${a})`);
    g.addColorStop(.48,`rgba(163,190,201,${a * .62})`);
    g.addColorStop(.82,`rgba(91,119,131,${a * .24})`);
    g.addColorStop(1,'rgba(30,48,56,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,128,128);
  }
  ctx.globalCompositeOperation = 'destination-out';
  for (let index=0; index<20; index+=1) {
    const x = (index * 37) % 121 + 3;
    const y = (index * 59) % 119 + 4;
    const r = 1.4 + (index % 4) * .9;
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle = `rgba(0,0,0,${.14 + (index % 3) * .07})`;
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  texture.update(false);
  disposables.push(texture);
  return texture;
}

function addPuddles(B, scene, profile, disposables) {
  const texture = createPuddleTexture(B, scene, disposables);
  const mat = new B.StandardMaterial('canonical-wet-asphalt', scene);
  mat.diffuseColor = new B.Color3(.12,.17,.19);
  mat.specularColor = new B.Color3(.75,.86,.91);
  mat.specularPower = 148;
  mat.diffuseTexture = texture;
  mat.opacityTexture = texture;
  mat.useAlphaFromDiffuseTexture = true;
  mat.alpha = .72 * profile.wetness;
  mat.backFaceCulling = false;
  mat.needDepthPrePass = true;
  disposables.push(mat);

  CHESSCOM_CANONICAL_PUDDLES.slice(0,profile.puddles).forEach((spot,index) => {
    const plane = B.MeshBuilder.CreatePlane(`canonical-puddle-${index}`, { width:spot.w,height:spot.h,sideOrientation:B.Mesh.DOUBLESIDE }, scene);
    plane.rotation.x = Math.PI / 2;
    plane.rotation.z = spot.r;
    plane.position.set(spot.x,.027,spot.z);
    plane.material = mat;
    plane.isPickable = false;
    plane.receiveShadows = false;
    disposables.push(plane);
  });
}

function makeFinishMaterial(B, scene, name, diffuse, specular, power, alpha = 1) {
  const mat = new B.StandardMaterial(name,scene);
  mat.diffuseColor = new B.Color3(...diffuse);
  mat.specularColor = new B.Color3(...specular);
  mat.specularPower = power;
  mat.alpha = alpha;
  return mat;
}

function addHazardPaint(B, scene, profile, disposables) {
  const amber = makeFinishMaterial(B,scene,'canonical-hazard-paint',[.39,.27,.075],[.12,.09,.03],32,.82);
  const pale = makeFinishMaterial(B,scene,'canonical-lane-paint',[.39,.43,.42],[.12,.13,.13],40,.56);
  disposables.push(amber,pale);
  const stripeSets = [
    { x:-4.35,z:-2.12,rotation:-.03,count:5 },
    { x:4.10,z:3.48,rotation:.04,count:4 },
  ];
  for (const set of stripeSets) {
    for (let index=0; index<set.count; index+=1) {
      const stripe = B.MeshBuilder.CreateBox(`canonical-hazard-${set.x}-${index}`, { width:.52,height:.018,depth:.085 }, scene);
      stripe.position.set(set.x + index * .33,.031,set.z + index * .055);
      stripe.rotation.y = set.rotation + (index % 2 ? .28 : -.28);
      stripe.material = amber;
      stripe.isPickable = false;
      disposables.push(stripe);
    }
  }
  if (profile.tier !== 'balanced') {
    [-2.85,.15,2.95].forEach((x,index) => {
      const lane = B.MeshBuilder.CreateBox(`canonical-lane-${index}`, { width:1.35,height:.012,depth:.035 }, scene);
      lane.position.set(x,.026,-4.72 + index * .07);
      lane.material = pale;
      lane.isPickable = false;
      disposables.push(lane);
    });
  }
}

function addCable(B, scene, index, path, mat, disposables) {
  if (!B.MeshBuilder.CreateTube) return;
  const mesh = B.MeshBuilder.CreateTube(`canonical-cable-${index}`, {
    path:path.map(([x,y,z]) => new B.Vector3(x,y,z)),
    radius:.026,
    tessellation:8,
    cap:B.Mesh.CAP_ROUND,
  }, scene);
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  disposables.push(mesh);
}

function addGroundCables(B, scene, profile, disposables) {
  const mat = makeFinishMaterial(B,scene,'canonical-cable-rubber',[.016,.019,.020],[.05,.055,.058],26,1);
  disposables.push(mat);
  const paths = [
    [[-1.75,.045,4.95],[-.9,.05,4.55],[.25,.045,4.82],[1.1,.05,4.52]],
    [[4.9,.05,-4.6],[4.1,.045,-4.08],[3.25,.05,-4.28],[2.7,.045,-3.8]],
    [[-5.3,.045,1.85],[-4.6,.05,1.38],[-3.9,.045,1.66],[-3.1,.05,1.28]],
  ];
  paths.slice(0,profile.cables).forEach((path,index) => addCable(B,scene,index,path,mat,disposables));
}

function addLightPools(B, scene, profile, disposables) {
  CHESSCOM_CANONICAL_LIGHTS.slice(0,profile.extraLights).forEach((spec,index) => {
    const light = new B.PointLight(`canonical-practical-${index}`,new B.Vector3(spec.x,spec.y,spec.z),scene);
    light.diffuse = new B.Color3(1,.39 + spec.warm * .08,.13);
    light.specular = new B.Color3(.55,.34,.16);
    light.intensity = profile.lightIntensity * spec.warm;
    light.range = spec.range;
    disposables.push(light);

    const bulbMat = new B.StandardMaterial(`canonical-practical-mat-${index}`,scene);
    bulbMat.diffuseColor = new B.Color3(.68,.32,.09);
    bulbMat.emissiveColor = new B.Color3(1,.37,.08);
    bulbMat.disableLighting = true;
    const bulb = B.MeshBuilder.CreateSphere(`canonical-practical-bulb-${index}`, { diameter:.075,segments:8 }, scene);
    bulb.position.set(spec.x,spec.y - .18,spec.z);
    bulb.material = bulbMat;
    bulb.isPickable = false;
    disposables.push(bulbMat,bulb);
  });
}

function addSelectionFill(B, scene, profile, disposables) {
  if (profile.tier === 'balanced') return;
  const fill = new B.PointLight('canonical-squad-fill',new B.Vector3(-1.9,2.3,4.1),scene);
  fill.diffuse = new B.Color3(.08,.43,.58);
  fill.specular = new B.Color3(.04,.18,.24);
  fill.intensity = 1.25;
  fill.range = 5.8;
  disposables.push(fill);
}

function installCanonicalScene(B, scene, profile) {
  const disposables = [];
  tuneScene(B,scene,profile);
  addPuddles(B,scene,profile,disposables);
  addHazardPaint(B,scene,profile,disposables);
  addGroundCables(B,scene,profile,disposables);
  addLightPools(B,scene,profile,disposables);
  addSelectionFill(B,scene,profile,disposables);
  return () => {
    for (const item of disposables.reverse()) {
      try { item?.dispose?.(); } catch {}
    }
  };
}

export async function createChesscomBabylon(host, options = {}) {
  const B = await loadChesscomBabylon();
  const { onReady, ...gpuOptions } = options;
  const base = await createGpuChesscomBabylon(host,{ ...gpuOptions,onReady:() => {} });
  const scene = sceneFromBabylon(B);
  if (!scene) {
    onReady?.(`BABYLON.JS ${BABYLON_VERSION} · GPU PREMIUM V2 · BALLISTICS`);
    return base;
  }

  const engine = scene.getEngine();
  const caps = engine.getCaps?.() || {};
  const profile = chesscomCanonicalQualityProfile({
    coarse:Boolean(window.matchMedia?.('(pointer: coarse)')?.matches),
    dpr:window.devicePixelRatio || 1,
    maxTextureSize:caps.maxTextureSize || 2048,
    webglVersion:engine.webGLVersion || 1,
  });
  const uninstall = installCanonicalScene(B,scene,profile);
  const unitCombat = installChesscomUnitCombatCanonical(B,scene,{ tier:profile.tier });
  const operatorV3 = installChesscomOperatorV3(B,scene);
  host.dataset.chesscomScene = CHESSCOM_CANONICAL_SCENE;
  host.dataset.chesscomSceneTier = profile.tier;
  host.dataset.chesscomUnits = 'mercenary-premium-v2';
  host.dataset.chesscomOperator = 'operator-v3';
  host.dataset.chesscomFireStance = 'weapon-muzzle-v1';
  onReady?.(`BABYLON.JS ${BABYLON_VERSION} · GPU PREMIUM V2 · BALLISTICS · UNIT STANCE · OPERATOR V3`);

  return {
    ...base,
    update(state, ui = {}) {
      base.update(state, ui);
      unitCombat.update(state);
      operatorV3.update(state);
    },
    destroy() {
      operatorV3.destroy();
      unitCombat.destroy();
      uninstall();
      delete host.dataset.chesscomScene;
      delete host.dataset.chesscomSceneTier;
      delete host.dataset.chesscomUnits;
      delete host.dataset.chesscomOperator;
      delete host.dataset.chesscomFireStance;
      base.destroy();
    },
  };
}

export { BABYLON_VERSION, loadChesscomBabylon };
