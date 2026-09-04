const BABYLON_VERSION = '9.25.0';
const BABYLON_URL = `https://cdn.jsdelivr.net/npm/babylonjs@${BABYLON_VERSION}/babylon.js`;

let babylonPromise;

export function loadChesscomBabylon() {
  if (globalThis.BABYLON) return Promise.resolve(globalThis.BABYLON);
  if (babylonPromise) return babylonPromise;
  babylonPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-chesscom-babylon]');
    if (existing) {
      existing.addEventListener('load', () => resolve(globalThis.BABYLON), { once:true });
      existing.addEventListener('error', () => reject(new Error('Babylon.js failed to load')), { once:true });
      return;
    }
    const script = document.createElement('script');
    script.src = BABYLON_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.chesscomBabylon = BABYLON_VERSION;
    script.onload = () => globalThis.BABYLON ? resolve(globalThis.BABYLON) : reject(new Error('Babylon.js global missing'));
    script.onerror = () => reject(new Error('Babylon.js failed to load'));
    document.head.appendChild(script);
  });
  return babylonPromise;
}

const MAP_W = 10;
const MAP_H = 8;
const TILE = 1.55;
const ORIGIN_X = -((MAP_W - 1) * TILE) / 2;
const ORIGIN_Z = -((MAP_H - 1) * TILE) / 2;

const SCENERY = [
  { x:0.2,z:0.2,w:4.6,d:2.4,h:2.4,type:'building',label:'OFFICE' },
  { x:6.0,z:0.0,w:3.8,d:2.2,h:2.8,type:'building',label:'STORAGE' },
  { x:0.3,z:4.4,w:3.0,d:2.3,h:2.1,type:'building',label:'NO FLAGS' },
  { x:7.2,z:5.2,w:2.9,d:2.0,h:2.2,type:'building',label:'JUST JOBS' },
  { x:2,z:2,type:'crate',high:true }, { x:3,z:2,type:'crate' }, { x:5,z:2,type:'crate',high:true },
  { x:6,z:2,type:'crate' }, { x:7,z:2,type:'crate',high:true }, { x:2,z:3,type:'barrel' },
  { x:6,z:3,type:'crate',high:true }, { x:8,z:3,type:'crate' }, { x:1,z:4,type:'crate',high:true },
  { x:5,z:4,type:'crate' }, { x:7,z:4,type:'crate',high:true }, { x:2,z:5,type:'crate',high:true },
  { x:4,z:5,type:'crate' }, { x:7,z:5,type:'sandbag' }, { x:8,z:5,type:'crate',high:true },
  { x:1,z:6,type:'barrel' }, { x:5,z:6,type:'crate',high:true }, { x:7,z:6,type:'sandbag' },
  { x:8,z:6,type:'crate',high:true }, { x:9,z:2,type:'truck' }, { x:8,z:0,type:'tower' },
];

function world(x, y, lift = 0) {
  return { x: ORIGIN_X + x * TILE, y: lift, z: ORIGIN_Z + y * TILE };
}

function color(B, hex) { return B.Color3.FromHexString(hex); }

function material(B, scene, name, diffuse, emissive = null, alpha = 1) {
  const mat = new B.StandardMaterial(name, scene);
  mat.diffuseColor = color(B, diffuse);
  mat.specularColor = new B.Color3(.16,.16,.16);
  mat.roughness = .82;
  mat.alpha = alpha;
  if (emissive) mat.emissiveColor = color(B, emissive);
  return mat;
}

function makeBox(B, scene, name, dims, position, mat, parent = null) {
  const mesh = B.MeshBuilder.CreateBox(name, { width:dims.w, height:dims.h, depth:dims.d }, scene);
  mesh.position.set(position.x, position.y + dims.h/2, position.z);
  mesh.material = mat;
  mesh.receiveShadows = true;
  if (parent) mesh.parent = parent;
  return mesh;
}

function createPawnAgent(B, scene, id, friendly, elite, mats) {
  const root = new B.TransformNode(`unit-${id}`, scene);
  const base = B.MeshBuilder.CreateCylinder(`${id}-base`, { height:.26, diameterTop:.72, diameterBottom:.94, tessellation:24 }, scene);
  base.parent = root; base.position.y = .13; base.material = friendly ? mats.friendlyBody : mats.enemyBody;
  const body = B.MeshBuilder.CreateCylinder(`${id}-body`, { height:.72, diameterTop:.48, diameterBottom:.72, tessellation:24 }, scene);
  body.parent = root; body.position.y = .65; body.material = friendly ? mats.friendlyBody : mats.enemyBody;
  const head = B.MeshBuilder.CreateSphere(`${id}-head`, { diameter:.48, segments:20 }, scene);
  head.parent = root; head.position.y = 1.18; head.material = elite ? mats.eliteHead : (friendly ? mats.friendlyHead : mats.enemyHead);
  const cap = B.MeshBuilder.CreateCylinder(`${id}-cap`, { height:.13, diameterTop:.48, diameterBottom:.55, tessellation:24 }, scene);
  cap.parent = root; cap.position.y = 1.44; cap.material = friendly ? mats.friendlyCap : mats.enemyCap;
  const gun = B.MeshBuilder.CreateBox(`${id}-gun`, { width:.72, height:.09, depth:.09 }, scene);
  gun.parent = root; gun.position.set(.38,.88,0); gun.rotation.z = -.08; gun.material = mats.gun;
  root.getChildMeshes().forEach((mesh) => { mesh.metadata = { type:'unit', id, friendly }; mesh.isPickable = true; });
  return root;
}

function createMatthiasCard(B, scene, dataUrl) {
  const root = new B.TransformNode('unit-matthias', scene);
  const plane = B.MeshBuilder.CreatePlane('matthias-card', { width:1.18, height:1.58 }, scene);
  plane.parent = root;
  plane.position.y = .86;
  plane.billboardMode = B.Mesh.BILLBOARDMODE_Y;
  const mat = new B.StandardMaterial('matthias-card-mat', scene);
  mat.diffuseTexture = new B.Texture(dataUrl, scene, true, false, B.Texture.TRILINEAR_SAMPLINGMODE, null, null, null, true);
  mat.diffuseTexture.hasAlpha = true;
  mat.useAlphaFromDiffuseTexture = true;
  mat.backFaceCulling = false;
  mat.emissiveColor = new B.Color3(.30,.28,.23);
  mat.specularColor = B.Color3.Black();
  plane.material = mat;
  plane.metadata = { type:'unit', id:'matthias', friendly:true };
  return root;
}

function addFence(B, scene, start, end, mats) {
  const dx = end.x - start.x; const dz = end.z - start.z;
  const length = Math.hypot(dx,dz);
  const angle = Math.atan2(dz,dx);
  const mid = { x:(start.x+end.x)/2, z:(start.z+end.z)/2 };
  const rail = makeBox(B, scene, 'fence-rail', {w:length,h:.08,d:.06}, {x:mid.x,y:.78,z:mid.z}, mats.metal);
  rail.rotation.y = -angle;
  for (let i=0;i<=Math.ceil(length/1.2);i+=1) {
    const t = i/Math.ceil(length/1.2);
    const x = start.x + dx*t; const z = start.z + dz*t;
    makeBox(B, scene, 'fence-post', {w:.07,h:1.65,d:.07}, {x,y:0,z}, mats.metal);
  }
}

function addScenery(B, scene, mats, shadowGenerator) {
  for (const item of SCENERY) {
    if (item.type === 'building') {
      const p = world(item.x,item.z);
      const box = makeBox(B, scene, `building-${item.label}`, {w:item.w,d:item.d,h:item.h}, p, mats.concrete);
      shadowGenerator?.addShadowCaster(box);
      const trim = makeBox(B, scene, 'building-trim', {w:item.w+.06,d:item.d+.06,h:.08}, {x:p.x,y:item.h,z:p.z}, mats.roof);
      shadowGenerator?.addShadowCaster(trim);
      continue;
    }
    const p = world(item.x,item.z);
    if (item.type === 'crate') {
      const h = item.high ? 1.05 : .58;
      const crate = makeBox(B, scene, 'crate', {w:1.05,d:1.05,h}, p, mats.wood);
      shadowGenerator?.addShadowCaster(crate);
      continue;
    }
    if (item.type === 'barrel') {
      const barrel = B.MeshBuilder.CreateCylinder('barrel', { height:.92, diameter:.58, tessellation:20 }, scene);
      barrel.position.set(p.x,.46,p.z); barrel.material = mats.barrel; shadowGenerator?.addShadowCaster(barrel); continue;
    }
    if (item.type === 'sandbag') {
      const bag = makeBox(B, scene, 'sandbag', {w:1.25,d:.52,h:.42}, p, mats.sandbag); bag.rotation.y=.15; shadowGenerator?.addShadowCaster(bag); continue;
    }
    if (item.type === 'truck') {
      const truck = makeBox(B, scene, 'truck-body', {w:2.35,d:1.18,h:.92}, p, mats.truck); truck.rotation.y=.18; shadowGenerator?.addShadowCaster(truck);
      const cab = makeBox(B, scene, 'truck-cab', {w:.92,d:1.12,h:1.16}, {x:p.x-.92,y:0,z:p.z}, mats.truck); cab.rotation.y=.18; shadowGenerator?.addShadowCaster(cab); continue;
    }
    if (item.type === 'tower') {
      const base = makeBox(B, scene, 'tower-platform', {w:1.7,d:1.7,h:.16}, {x:p.x,y:2.05,z:p.z}, mats.metal);
      shadowGenerator?.addShadowCaster(base);
      for (const [ox,oz] of [[-.7,-.7],[.7,-.7],[-.7,.7],[.7,.7]]) makeBox(B, scene, 'tower-leg',{w:.09,d:.09,h:2.05},{x:p.x+ox,y:0,z:p.z+oz},mats.metal);
    }
  }
  addFence(B, scene, {x:world(4.7,0).x,z:world(4.7,0).z},{x:world(4.7,4.2).x,z:world(4.7,4.2).z},mats);
  addFence(B, scene, {x:world(6.9,2.3).x,z:world(6.9,2.3).z},{x:world(9,4.4).x,z:world(9,4.4).z},mats);
}

function createTile(B, scene, x, y, mats) {
  const p = world(x,y,.015);
  const tile = B.MeshBuilder.CreateBox(`tile-${x}-${y}`, { width:TILE*.94, depth:TILE*.94, height:.03 }, scene);
  tile.position.set(p.x,p.y,p.z);
  tile.material = mats.tile;
  tile.isPickable = true;
  tile.metadata = { type:'tile', x, y };
  return tile;
}

export async function createChesscomBabylon(host, { onTile, onUnit, onHover, onReady } = {}) {
  const B = await loadChesscomBabylon();
  if (!host) throw new Error('Chesscom Babylon host missing');
  const canvas = document.createElement('canvas');
  canvas.className = 'chesscom-babylon-canvas';
  canvas.setAttribute('aria-label', 'Campo táctico 3D de Chesscom');
  host.replaceChildren(canvas);

  const engine = new B.Engine(canvas, true, { preserveDrawingBuffer:false, stencil:true, antialias:true, adaptToDeviceRatio:true });
  const scene = new B.Scene(engine);
  scene.clearColor = new B.Color4(.018,.023,.029,1);
  scene.fogMode = B.Scene.FOGMODE_EXP2;
  scene.fogDensity = .018;
  scene.fogColor = new B.Color3(.035,.045,.052);
  scene.imageProcessingConfiguration.contrast = 1.22;
  scene.imageProcessingConfiguration.exposure = .88;

  const camera = new B.ArcRotateCamera('chesscom-camera', -Math.PI/4, 1.08, 22, new B.Vector3(0,0,0), scene);
  camera.mode = B.Camera.ORTHOGRAPHIC_CAMERA;
  camera.orthoLeft = -10.7; camera.orthoRight = 10.7; camera.orthoTop = 7.1; camera.orthoBottom = -7.1;
  camera.lowerRadiusLimit = 18; camera.upperRadiusLimit = 26;
  camera.attachControl(canvas, true);
  camera.inputs.removeByType?.('ArcRotateCameraMouseWheelInput');
  camera.inputs.removeByType?.('ArcRotateCameraPointersInput');

  const hemi = new B.HemisphericLight('ambient', new B.Vector3(0,1,0), scene);
  hemi.intensity = .30; hemi.diffuse = new B.Color3(.26,.33,.40); hemi.groundColor = new B.Color3(.05,.04,.03);
  const moon = new B.DirectionalLight('moon', new B.Vector3(-.45,-1,.34), scene);
  moon.position = new B.Vector3(10,16,-10); moon.intensity = 1.25; moon.diffuse = new B.Color3(.38,.52,.70);
  const shadowGenerator = new B.ShadowGenerator(2048, moon); shadowGenerator.useBlurExponentialShadowMap = true; shadowGenerator.blurKernel = 18;
  const warmA = new B.PointLight('warm-a', new B.Vector3(-4.8,3.2,-1.2), scene); warmA.diffuse = new B.Color3(1,.52,.20); warmA.intensity = 19; warmA.range = 7;
  const warmB = new B.PointLight('warm-b', new B.Vector3(5.6,3.0,2.6), scene); warmB.diffuse = new B.Color3(1,.42,.15); warmB.intensity = 15; warmB.range = 6.5;

  const mats = {
    ground:material(B,scene,'ground','#252a2c'), tile:material(B,scene,'tile','#2b3031'), concrete:material(B,scene,'concrete','#323537'), roof:material(B,scene,'roof','#1a1d1f'),
    wood:material(B,scene,'wood','#6b4827'), barrel:material(B,scene,'barrel','#622b20'), sandbag:material(B,scene,'sandbag','#7c6a4a'), metal:material(B,scene,'metal','#242a2f'), truck:material(B,scene,'truck','#27302e'),
    friendlyBody:material(B,scene,'friendlyBody','#25282a'), friendlyHead:material(B,scene,'friendlyHead','#e4d6ad'), friendlyCap:material(B,scene,'friendlyCap','#2a2925'),
    enemyBody:material(B,scene,'enemyBody','#302a26'), enemyHead:material(B,scene,'enemyHead','#b7a385'), enemyCap:material(B,scene,'enemyCap','#1a1817'), eliteHead:material(B,scene,'eliteHead','#8c2c25','#250403'), gun:material(B,scene,'gun','#121516'),
    blue:material(B,scene,'reachable','#163c55','#0c6c9a',.73), cyan:material(B,scene,'selected','#1a5368','#16a9e0',.82), red:material(B,scene,'target','#641d1d','#bb1d1d',.76), intel:material(B,scene,'intel','#826a28','#cca52c',.82), exfil:material(B,scene,'exfil','#1e634a','#23a66f',.72),
  };

  const ground = B.MeshBuilder.CreateGround('compound-ground', { width:20.5, height:16.5, subdivisions:2 }, scene); ground.material = mats.ground; ground.receiveShadows = true;
  const tiles = new Map();
  for (let y=0;y<MAP_H;y+=1) for (let x=0;x<MAP_W;x+=1) tiles.set(`${x},${y}`, createTile(B,scene,x,y,mats));
  addScenery(B, scene, mats, shadowGenerator);

  const glow = new B.GlowLayer('chesscom-glow', scene, { blurKernelSize:16 }); glow.intensity = .42;
  const unitRoots = new Map();
  const markers = new Map();
  let matthiasUrl = null;

  function markerFor(id) {
    if (markers.has(id)) return markers.get(id);
    const ring = B.MeshBuilder.CreateTorus(`marker-${id}`, { diameter:1.28, thickness:.055, tessellation:32 }, scene);
    ring.rotation.x = Math.PI/2; ring.material = mats.cyan; ring.isVisible = false; glow.addIncludedOnlyMesh(ring); markers.set(id,ring); return ring;
  }

  function ensureUnit(unit, friendly, matthiasArt) {
    if (unitRoots.has(unit.id)) return unitRoots.get(unit.id);
    let root;
    if (unit.id === 'matthias' && matthiasArt) { matthiasUrl = matthiasArt; root = createMatthiasCard(B,scene,matthiasArt); }
    else root = createPawnAgent(B,scene,unit.id,friendly,unit.elite,mats);
    root.getChildMeshes().forEach((mesh) => shadowGenerator.addShadowCaster(mesh));
    unitRoots.set(unit.id, root); return root;
  }

  scene.onPointerObservable.add((pointerInfo) => {
    const pick = pointerInfo.pickInfo;
    const meta = pick?.pickedMesh?.metadata;
    if (!meta) { if (pointerInfo.type === B.PointerEventTypes.POINTERMOVE) onHover?.(null); return; }
    if (pointerInfo.type === B.PointerEventTypes.POINTERMOVE) onHover?.(meta);
    if (pointerInfo.type !== B.PointerEventTypes.POINTERPICK) return;
    if (meta.type === 'tile') onTile?.(meta.x,meta.y);
    if (meta.type === 'unit') onUnit?.(meta.id,meta.friendly);
  });

  function update(state, { reachable = new Set(), targetable = new Set(), selectedId = null, matthiasArt = '' } = {}) {
    for (const [key,tile] of tiles) {
      const [x,y] = key.split(',').map(Number);
      if (x === 6 && y === 2 && !state.objectives.intel) tile.material = mats.intel;
      else if (x === 1 && y === 7) tile.material = mats.exfil;
      else if (targetable.has(key)) tile.material = mats.red;
      else if (reachable.has(key)) tile.material = mats.blue;
      else tile.material = mats.tile;
    }
    for (const unit of [...state.friendlies,...state.enemies]) {
      const friendly = state.friendlies.some((candidate) => candidate.id === unit.id);
      const root = ensureUnit(unit,friendly,matthiasArt || matthiasUrl);
      const p = world(unit.x,unit.y,0);
      root.position.set(p.x, unit.hp > 0 ? .03 : -.55, p.z);
      root.setEnabled(unit.hp > 0);
      root.rotation.y = friendly ? -.55 : 2.35;
      const ring = markerFor(unit.id); ring.position.set(p.x,.055,p.z); ring.isVisible = unit.hp > 0 && (unit.id === selectedId || (!friendly && targetable.has(`${unit.x},${unit.y}`))); ring.material = friendly ? mats.cyan : mats.red;
    }
  }

  const resize = () => engine.resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(host);
  window.addEventListener('resize', resize);
  engine.runRenderLoop(() => scene.render());
  onReady?.(`BABYLON.JS ${BABYLON_VERSION}`);

  return {
    update,
    resize,
    destroy() {
      ro?.disconnect(); window.removeEventListener('resize',resize); engine.stopRenderLoop(); scene.dispose(); engine.dispose(); canvas.remove();
    },
  };
}

export { BABYLON_VERSION };
