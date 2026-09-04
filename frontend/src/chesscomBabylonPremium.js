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
const INTEL = { x:6,y:2 };
const EXFIL = { x:1,y:7 };

const SCENERY = [
  { x:.2,z:.2,w:4.6,d:2.4,h:2.45,type:'building',label:'OFFICE' },
  { x:6,z:0,w:3.8,d:2.2,h:2.85,type:'building',label:'STORAGE' },
  { x:.3,z:4.4,w:3,d:2.3,h:2.15,type:'building',label:'NO FLAGS' },
  { x:7.2,z:5.2,w:2.9,d:2,h:2.25,type:'building',label:'JUST JOBS' },
  { x:2,z:2,type:'crate',high:true }, { x:3,z:2,type:'crate' }, { x:5,z:2,type:'crate',high:true },
  { x:6,z:2,type:'crate' }, { x:7,z:2,type:'crate',high:true }, { x:2,z:3,type:'barrel' },
  { x:6,z:3,type:'crate',high:true }, { x:8,z:3,type:'crate' }, { x:1,z:4,type:'crate',high:true },
  { x:5,z:4,type:'crate' }, { x:7,z:4,type:'crate',high:true }, { x:2,z:5,type:'crate',high:true },
  { x:4,z:5,type:'crate' }, { x:7,z:5,type:'sandbag' }, { x:8,z:5,type:'crate',high:true },
  { x:1,z:6,type:'barrel' }, { x:5,z:6,type:'crate',high:true }, { x:7,z:6,type:'sandbag' },
  { x:8,z:6,type:'crate',high:true }, { x:9,z:2,type:'truck' }, { x:8,z:0,type:'tower' },
];

function world(x, y, lift = 0) {
  return { x:ORIGIN_X + x * TILE, y:lift, z:ORIGIN_Z + y * TILE };
}

function color(B, hex) { return B.Color3.FromHexString(hex); }

function material(B, scene, name, diffuse, emissive = null, alpha = 1) {
  const mat = new B.StandardMaterial(name, scene);
  mat.diffuseColor = color(B,diffuse);
  mat.specularColor = new B.Color3(.12,.12,.12);
  mat.alpha = alpha;
  if (emissive) mat.emissiveColor = color(B,emissive);
  return mat;
}

function box(B, scene, name, w, h, d, parent, mat, x = 0, y = 0, z = 0) {
  const mesh = B.MeshBuilder.CreateBox(name,{ width:w,height:h,depth:d },scene);
  mesh.parent = parent || null;
  mesh.position.set(x,y,z);
  mesh.material = mat;
  mesh.receiveShadows = true;
  return mesh;
}

function cylinder(B, scene, name, height, diameter, parent, mat, x = 0, y = 0, z = 0, tessellation = 18) {
  const mesh = B.MeshBuilder.CreateCylinder(name,{ height,diameter,tessellation },scene);
  mesh.parent = parent || null;
  mesh.position.set(x,y,z);
  mesh.material = mat;
  mesh.receiveShadows = true;
  return mesh;
}

function makeWorldBox(B,scene,name,dims,p,mat) {
  return box(B,scene,name,dims.w,dims.h,dims.d,null,mat,p.x,p.y + dims.h/2,p.z);
}

function tagUnit(root, id, friendly) {
  root.getChildMeshes().forEach((mesh) => {
    mesh.metadata = { type:'unit',id,friendly };
    mesh.isPickable = true;
  });
}

function createRifle(B, scene, root, mats, compact = false) {
  const weapon = new B.TransformNode('rifle',scene);
  weapon.parent = root;
  weapon.position.set(.28,.92,-.18);
  weapon.rotation.z = -.08;
  const receiver = box(B,scene,'rifle-receiver',compact ? .52 : .68,.10,.13,weapon,mats.gun,.18,0,0);
  const stock = box(B,scene,'rifle-stock',.25,.12,.11,weapon,mats.gun,-.18,.01,0);
  const barrel = cylinder(B,scene,'rifle-barrel',compact ? .32 : .48,.055,weapon,mats.gun,.65,0,0,12);
  barrel.rotation.z = Math.PI/2;
  const mag = box(B,scene,'rifle-mag',.12,.26,.10,weapon,mats.gun,.16,-.16,0);
  mag.rotation.z = -.18;
  const optic = box(B,scene,'rifle-optic',.18,.08,.09,weapon,mats.metal,.24,.11,0);
  return { weapon, muzzle:new B.Vector3(compact ? .86 : 1.0,.92,-.18), meshes:[receiver,stock,barrel,mag,optic] };
}

function createTacticalAgent(B, scene, id, friendly, elite, mats) {
  const root = new B.TransformNode(`unit-${id}`,scene);
  root.metadata = { phase:Math.random()*Math.PI*2,target:null,initialized:false };
  const uniform = friendly ? mats.friendlyBody : mats.enemyBody;
  const armour = friendly ? mats.friendlyArmour : mats.enemyArmour;
  const skin = friendly ? mats.friendlyHead : mats.enemyHead;

  box(B,scene,`${id}-pelvis`,.48,.28,.30,root,uniform,0,.49,0);
  const torso = box(B,scene,`${id}-torso`,.56,.62,.34,root,uniform,0,.83,0);
  box(B,scene,`${id}-plate`,.46,.48,.08,root,armour,0,.86,-.19);
  box(B,scene,`${id}-pack`,.38,.45,.16,root,mats.pack,0,.86,.24);
  cylinder(B,scene,`${id}-leg-l`,.52,.17,root,uniform,-.14,.25,0);
  cylinder(B,scene,`${id}-leg-r`,.52,.17,root,uniform,.14,.25,0);
  box(B,scene,`${id}-boot-l`,.18,.13,.30,root,mats.boot,-.14,.06,-.05);
  box(B,scene,`${id}-boot-r`,.18,.13,.30,root,mats.boot,.14,.06,-.05);
  const head = B.MeshBuilder.CreateSphere(`${id}-head`,{ diameter:.37,segments:18 },scene);
  head.parent=root; head.position.set(0,1.27,-.015); head.material=skin;
  const helmet = B.MeshBuilder.CreateSphere(`${id}-helmet`,{ diameter:.43,segments:18,slice:.58 },scene);
  helmet.parent=root; helmet.position.set(0,1.37,.01); helmet.scaling.y=.72; helmet.material=elite ? mats.eliteHelmet : mats.helmet;
  box(B,scene,`${id}-helmet-band`,.47,.07,.39,root,elite ? mats.eliteTrim : mats.helmetBand,0,1.34,0);
  const armL = box(B,scene,`${id}-arm-l`,.14,.16,.50,root,uniform,-.31,.91,-.15); armL.rotation.x=.18; armL.rotation.y=-.2;
  const armR = box(B,scene,`${id}-arm-r`,.14,.16,.50,root,uniform,.31,.91,-.15); armR.rotation.x=-.18; armR.rotation.y=.2;
  box(B,scene,`${id}-glove-l`,.15,.15,.16,root,mats.glove,-.23,.87,-.39);
  box(B,scene,`${id}-glove-r`,.15,.15,.16,root,mats.glove,.23,.87,-.39);
  box(B,scene,`${id}-belt`,.59,.09,.36,root,mats.metal,0,.57,0);
  box(B,scene,`${id}-pouch-l`,.17,.20,.15,root,mats.pouch,-.22,.52,-.14);
  box(B,scene,`${id}-pouch-r`,.17,.20,.15,root,mats.pouch,.22,.52,-.14);
  if (!friendly) box(B,scene,`${id}-visor`,.28,.07,.04,root,elite ? mats.eliteVisor : mats.enemyVisor,0,1.28,-.19);
  const rifle = createRifle(B,scene,root,mats,id === 'sven');
  rifle.weapon.position.z = -.28;
  tagUnit(root,id,friendly);
  root.metadata.parts = { torso,head,helmet,armL,armR,weapon:rifle.weapon };
  root.metadata.muzzle = rifle.muzzle;
  return root;
}

function createMatthiasCard(B, scene, dataUrl, mats) {
  const root = new B.TransformNode('unit-matthias',scene);
  root.metadata = { phase:1.2,target:null,initialized:false };
  const plane = B.MeshBuilder.CreatePlane('matthias-card',{ width:1.34,height:1.78 },scene);
  plane.parent=root; plane.position.y=.88; plane.billboardMode=B.Mesh.BILLBOARDMODE_Y;
  const mat = new B.StandardMaterial('matthias-card-mat',scene);
  mat.diffuseTexture = new B.Texture(dataUrl,scene,true,true,B.Texture.TRILINEAR_SAMPLINGMODE,null,null,null,true);
  mat.diffuseTexture.hasAlpha=true; mat.useAlphaFromDiffuseTexture=true; mat.backFaceCulling=false;
  mat.emissiveColor=new B.Color3(.25,.23,.18); mat.specularColor=B.Color3.Black(); plane.material=mat;
  const rifle = createRifle(B,scene,root,mats,false);
  rifle.weapon.scaling.set(.78,.78,.78); rifle.weapon.position.set(.25,.72,-.24);
  root.metadata.parts={ weapon:rifle.weapon };
  root.metadata.muzzle=rifle.muzzle.scale(.78).add(new B.Vector3(.25,-.20,-.06));
  tagUnit(root,'matthias',true);
  return root;
}

function addFence(B,scene,start,end,mats) {
  const dx=end.x-start.x; const dz=end.z-start.z; const length=Math.hypot(dx,dz); const angle=Math.atan2(dz,dx);
  const mid={x:(start.x+end.x)/2,z:(start.z+end.z)/2};
  for (const y of [.48,.93,1.38]) {
    const rail=makeWorldBox(B,scene,'fence-rail',{w:length,h:.045,d:.045},{x:mid.x,y,z:mid.z},mats.metal); rail.rotation.y=-angle;
  }
  const count=Math.max(1,Math.ceil(length/1.1));
  for(let i=0;i<=count;i+=1){const t=i/count;makeWorldBox(B,scene,'fence-post',{w:.06,h:1.6,d:.06},{x:start.x+dx*t,y:0,z:start.z+dz*t},mats.metal);}
}

function addBuildingDetails(B,scene,p,item,mats,shadowGenerator,warmLights) {
  const wall=makeWorldBox(B,scene,`building-${item.label}`,{w:item.w,d:item.d,h:item.h},p,mats.concrete); shadowGenerator?.addShadowCaster(wall);
  const roof=makeWorldBox(B,scene,'building-roof',{w:item.w+.10,d:item.d+.10,h:.11},{x:p.x,y:item.h,z:p.z},mats.roof); shadowGenerator?.addShadowCaster(roof);
  const door=makeWorldBox(B,scene,'service-door',{w:.72,d:.035,h:1.12},{x:p.x-item.w*.27,y:0,z:p.z-item.d/2-.025},mats.door);
  const lamp=makeWorldBox(B,scene,'door-lamp',{w:.30,d:.07,h:.10},{x:door.position.x,y:1.55,z:p.z-item.d/2-.10},mats.lamp);
  const light=new B.PointLight('door-light',new B.Vector3(lamp.position.x,1.6,lamp.position.z-.25),scene);
  light.diffuse=new B.Color3(1,.48,.18); light.intensity=5.2; light.range=3.4; warmLights.push(light);
  for(let i=-1;i<=1;i+=1) makeWorldBox(B,scene,'wall-vent',{w:.34,d:.04,h:.16},{x:p.x+i*.55,y:1.65,z:p.z+item.d/2+.025},mats.metal);
}

function addScenery(B,scene,mats,shadowGenerator,warmLights) {
  for(const item of SCENERY){
    const p=world(item.x,item.z);
    if(item.type==='building'){addBuildingDetails(B,scene,p,item,mats,shadowGenerator,warmLights);continue;}
    if(item.type==='crate'){
      const h=item.high ? 1.05 : .58; const crate=makeWorldBox(B,scene,'crate',{w:1.03,d:1.03,h},p,mats.wood); shadowGenerator?.addShadowCaster(crate);
      for(const offset of [-.36,.36]){makeWorldBox(B,scene,'crate-band',{w:.07,d:1.06,h:h+.02},{x:p.x+offset,y:0,z:p.z},mats.metal);makeWorldBox(B,scene,'crate-band',{w:1.06,d:.07,h:h+.02},{x:p.x,y:0,z:p.z+offset},mats.metal);}continue;
    }
    if(item.type==='barrel'){
      const barrel=cylinder(B,scene,'barrel',.92,.58,null,mats.barrel,p.x,.46,p.z,20); shadowGenerator?.addShadowCaster(barrel);
      for(const y of [.18,.72]) cylinder(B,scene,'barrel-ring',.035,.61,null,mats.metal,p.x,y,p.z,20);continue;
    }
    if(item.type==='sandbag'){
      for(let i=0;i<3;i+=1){const bag=makeWorldBox(B,scene,'sandbag',{w:.62,d:.48,h:.28},{x:p.x+(i-1)*.45,y:i===1 ? .16 : 0,z:p.z},mats.sandbag);bag.rotation.y=(i-1)*.08;shadowGenerator?.addShadowCaster(bag);}continue;
    }
    if(item.type==='truck'){
      const truck=makeWorldBox(B,scene,'truck-body',{w:2.35,d:1.18,h:.86},p,mats.truck);truck.rotation.y=.18;shadowGenerator?.addShadowCaster(truck);
      const cab=makeWorldBox(B,scene,'truck-cab',{w:.92,d:1.12,h:1.10},{x:p.x-.92,y:0,z:p.z},mats.truck);cab.rotation.y=.18;shadowGenerator?.addShadowCaster(cab);
      for(const ox of [-.75,.75])for(const oz of [-.48,.48]){const wheel=cylinder(B,scene,'truck-wheel',.22,.38,null,mats.tire,p.x+ox,.23,p.z+oz,16);wheel.rotation.z=Math.PI/2;}continue;
    }
    if(item.type==='tower'){
      const platform=makeWorldBox(B,scene,'tower-platform',{w:1.75,d:1.75,h:.15},{x:p.x,y:2.05,z:p.z},mats.metal);shadowGenerator?.addShadowCaster(platform);
      for(const [ox,oz] of [[-.7,-.7],[.7,-.7],[-.7,.7],[.7,.7]])makeWorldBox(B,scene,'tower-leg',{w:.08,d:.08,h:2.05},{x:p.x+ox,y:0,z:p.z+oz},mats.metal);
      for(const z of [-.78,.78])makeWorldBox(B,scene,'tower-rail',{w:1.7,d:.05,h:.06},{x:p.x,y:2.55,z:p.z+z},mats.metal);
      const search=new B.SpotLight('tower-search',new B.Vector3(p.x,2.72,p.z),new B.Vector3(-.5,-.9,.35),Math.PI/5,8,scene);search.diffuse=new B.Color3(.78,.84,.76);search.intensity=13;search.range=11;continue;
    }
  }
  addFence(B,scene,{x:world(4.7,0).x,z:world(4.7,0).z},{x:world(4.7,4.2).x,z:world(4.7,4.2).z},mats);
  addFence(B,scene,{x:world(6.9,2.3).x,z:world(6.9,2.3).z},{x:world(9,4.4).x,z:world(9,4.4).z},mats);
}

function createTile(B,scene,x,y,mats) {
  const p=world(x,y,.015); const tile=B.MeshBuilder.CreateBox(`tile-${x}-${y}`,{width:TILE*.94,depth:TILE*.94,height:.025},scene);
  tile.position.set(p.x,p.y,p.z);tile.material=mats.tile;tile.isPickable=true;tile.metadata={type:'tile',x,y};return tile;
}

function createMissionProps(B,scene,mats,glow) {
  const intelP=world(INTEL.x,INTEL.y,.05);
  const intel=makeWorldBox(B,scene,'intel-case',{w:.68,d:.44,h:.25},intelP,mats.intelCase);intel.position.y=.18;
  const intelLamp=makeWorldBox(B,scene,'intel-led',{w:.12,d:.04,h:.035},{x:intelP.x,y:.28,z:intelP.z-.23},mats.intel);glow.addIncludedOnlyMesh(intelLamp);
  const ex=world(EXFIL.x,EXFIL.y,.04);
  const ring=B.MeshBuilder.CreateTorus('exfil-ring',{diameter:1.12,thickness:.055,tessellation:36},scene);ring.rotation.x=Math.PI/2;ring.position.set(ex.x,.05,ex.z);ring.material=mats.exfil;glow.addIncludedOnlyMesh(ring);
  const beacon=cylinder(B,scene,'exfil-beacon',1.65,.035,null,mats.exfil,ex.x,.86,ex.z,12);glow.addIncludedOnlyMesh(beacon);
  const light=new B.PointLight('exfil-light',new B.Vector3(ex.x,.55,ex.z),scene);light.diffuse=new B.Color3(.12,.68,1);light.intensity=4.5;light.range=3;
  return { intel,intelLamp,ring,beacon,exfilLight:light };
}

export async function createChesscomBabylon(host,{onTile,onUnit,onHover,onReady}={}) {
  const B=await loadChesscomBabylon();
  if(!host)throw new Error('Chesscom Babylon host missing');
  const canvas=document.createElement('canvas');canvas.className='chesscom-babylon-canvas';canvas.setAttribute('aria-label','Campo táctico 3D de Chesscom');host.replaceChildren(canvas);
  const reduced=Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const coarse=Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const engine=new B.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true,antialias:!coarse,adaptToDeviceRatio:true});
  engine.setHardwareScalingLevel?.(Math.max(1,(window.devicePixelRatio||1)/(coarse ? 1.2 : 1.65)));
  const scene=new B.Scene(engine);scene.clearColor=new B.Color4(.012,.016,.020,1);scene.fogMode=B.Scene.FOGMODE_EXP2;scene.fogDensity=.014;scene.fogColor=new B.Color3(.025,.033,.040);scene.imageProcessingConfiguration.contrast=1.34;scene.imageProcessingConfiguration.exposure=.82;
  const camera=new B.ArcRotateCamera('chesscom-camera',-Math.PI/4,1.03,21,new B.Vector3(.35,.50,.15),scene);camera.mode=B.Camera.ORTHOGRAPHIC_CAMERA;camera.orthoLeft=-9.65;camera.orthoRight=9.65;camera.orthoTop=6.35;camera.orthoBottom=-6.35;camera.lowerRadiusLimit=19;camera.upperRadiusLimit=24;camera.attachControl(canvas,true);camera.inputs.removeByType?.('ArcRotateCameraMouseWheelInput');camera.inputs.removeByType?.('ArcRotateCameraPointersInput');

  const hemi=new B.HemisphericLight('ambient',new B.Vector3(0,1,0),scene);hemi.intensity=.34;hemi.diffuse=new B.Color3(.24,.32,.42);hemi.groundColor=new B.Color3(.025,.022,.020);
  const moon=new B.DirectionalLight('moon',new B.Vector3(-.42,-1,.30),scene);moon.position=new B.Vector3(11,16,-9);moon.intensity=1.52;moon.diffuse=new B.Color3(.37,.52,.72);
  const shadowGenerator=new B.ShadowGenerator(coarse ? 1024 : 2048,moon);shadowGenerator.useBlurExponentialShadowMap=true;shadowGenerator.blurKernel=coarse ? 8 : 16;
  const warmLights=[];

  const mats={
    ground:material(B,scene,'ground','#161b1e'),tile:material(B,scene,'tile','#242b2e'),road:material(B,scene,'road','#202426'),concrete:material(B,scene,'concrete','#303437'),roof:material(B,scene,'roof','#15191c'),door:material(B,scene,'door','#1d2225'),lamp:material(B,scene,'lamp','#8a5726','#ff8c32'),
    wood:material(B,scene,'wood','#5a4029'),barrel:material(B,scene,'barrel','#642d22'),sandbag:material(B,scene,'sandbag','#6f654d'),metal:material(B,scene,'metal','#252b30'),truck:material(B,scene,'truck','#28332f'),tire:material(B,scene,'tire','#0b0d0e'),
    friendlyBody:material(B,scene,'friendly-body','#2f3434'),friendlyArmour:material(B,scene,'friendly-armour','#161b1c'),friendlyHead:material(B,scene,'friendly-head','#bda985'),enemyBody:material(B,scene,'enemy-body','#302d28'),enemyArmour:material(B,scene,'enemy-armour','#171818'),enemyHead:material(B,scene,'enemy-head','#a18d71'),helmet:material(B,scene,'helmet','#252a28'),helmetBand:material(B,scene,'helmet-band','#151817'),eliteHelmet:material(B,scene,'elite-helmet','#211817'),eliteTrim:material(B,scene,'elite-trim','#6f211c'),pack:material(B,scene,'pack','#202522'),boot:material(B,scene,'boot','#101314'),glove:material(B,scene,'glove','#0c0f10'),pouch:material(B,scene,'pouch','#4a4434'),gun:material(B,scene,'gun','#101315'),
    enemyVisor:material(B,scene,'enemy-visor','#421111','#ff2929'),eliteVisor:material(B,scene,'elite-visor','#6d1515','#ff1717'),
    blue:material(B,scene,'reachable','#12394e','#0872a4',.74),cyan:material(B,scene,'selected','#155269','#13b6ef',.88),red:material(B,scene,'target','#601818','#df2626',.87),intel:material(B,scene,'intel','#88651b','#ffca38',.92),exfil:material(B,scene,'exfil','#0b607b','#12bdf4',.88),intelCase:material(B,scene,'intel-case','#403b25'),
    muzzle:material(B,scene,'muzzle','#ffb642','#ffad25'),impact:material(B,scene,'impact','#ffdf9b','#ff9e35'),
  };

  const ground=makeWorldBox(B,scene,'compound-ground',{w:MAP_W*TILE+3.4,d:MAP_H*TILE+3.2,h:.18},{x:0,y:-.18,z:0},mats.ground);ground.receiveShadows=true;
  makeWorldBox(B,scene,'road-a',{w:MAP_W*TILE+1,d:2.2,h:.025},{x:0,y:.015,z:2.55},mats.road);
  makeWorldBox(B,scene,'road-b',{w:2.5,d:MAP_H*TILE+1,h:.025},{x:4.45,y:.017,z:0},mats.road);
  const warmA=new B.PointLight('warm-a',new B.Vector3(-4.8,3.2,-1.2),scene);warmA.diffuse=new B.Color3(1,.50,.18);warmA.intensity=13;warmA.range=7;warmLights.push(warmA);
  const warmB=new B.PointLight('warm-b',new B.Vector3(5.6,3.0,2.6),scene);warmB.diffuse=new B.Color3(1,.39,.13);warmB.intensity=11;warmB.range=6.5;warmLights.push(warmB);
  addScenery(B,scene,mats,shadowGenerator,warmLights);

  const tiles=new Map();for(let y=0;y<MAP_H;y+=1)for(let x=0;x<MAP_W;x+=1)tiles.set(`${x},${y}`,createTile(B,scene,x,y,mats));
  const glow=new B.GlowLayer('ops-glow',scene,{blurKernelSize:coarse ? 16 : 28});glow.intensity=.72;
  const props=createMissionProps(B,scene,mats,glow);
  const unitRoots=new Map();const markers=new Map();const fx=[];let matthiasUrl='';let previous=null;let previousObjectives={intel:false,extraction:false,target:false};

  function markerFor(id){if(markers.has(id))return markers.get(id);const ring=B.MeshBuilder.CreateTorus(`marker-${id}`,{diameter:1.18,thickness:.05,tessellation:32},scene);ring.rotation.x=Math.PI/2;ring.material=mats.cyan;ring.isVisible=false;glow.addIncludedOnlyMesh(ring);markers.set(id,ring);return ring;}
  function ensureUnit(unit,friendly,matthiasArt){if(unitRoots.has(unit.id))return unitRoots.get(unit.id);let root;if(unit.id==='matthias'&&matthiasArt){matthiasUrl=matthiasArt;root=createMatthiasCard(B,scene,matthiasArt,mats);}else root=createTacticalAgent(B,scene,unit.id,friendly,unit.elite,mats);root.getChildMeshes().forEach((mesh)=>shadowGenerator.addShadowCaster(mesh));unitRoots.set(unit.id,root);return root;}
  function pushFx(mesh,life=260){mesh.isPickable=false;fx.push({mesh,born:performance.now(),life});return mesh;}
  function shotFx(source,target,friendly=true){if(!source||!target||reduced)return;const a=world(source.x,source.y,1.0);const b=world(target.x,target.y,.95);const start=new B.Vector3(a.x,a.y,a.z);const end=new B.Vector3(b.x,b.y,b.z);const muzzle=B.MeshBuilder.CreateSphere('muzzle-flash',{diameter:.25,segments:8},scene);muzzle.position.copyFrom(start);muzzle.material=mats.muzzle;glow.addIncludedOnlyMesh(muzzle);pushFx(muzzle,115);const line=B.MeshBuilder.CreateLines('tracer',{points:[start,end]},scene);line.color=friendly ? new B.Color3(1,.72,.26) : new B.Color3(1,.22,.15);line.alpha=.92;pushFx(line,150);const hit=B.MeshBuilder.CreateSphere('impact',{diameter:.18,segments:7},scene);hit.position.copyFrom(end);hit.material=mats.impact;glow.addIncludedOnlyMesh(hit);pushFx(hit,220);}
  function pulseAt(pos,mat){const ring=B.MeshBuilder.CreateTorus('objective-pulse',{diameter:1.4,thickness:.045,tessellation:32},scene);ring.rotation.x=Math.PI/2;ring.position.set(pos.x,.075,pos.z);ring.material=mat;glow.addIncludedOnlyMesh(ring);pushFx(ring,650);}

  scene.onPointerObservable.add((pointerInfo)=>{const pick=pointerInfo.pickInfo;const meta=pick?.pickedMesh?.metadata;if(!meta){if(pointerInfo.type===B.PointerEventTypes.POINTERMOVE)onHover?.(null);return;}if(pointerInfo.type===B.PointerEventTypes.POINTERMOVE)onHover?.(meta);if(pointerInfo.type!==B.PointerEventTypes.POINTERPICK)return;if(meta.type==='tile')onTile?.(meta.x,meta.y);if(meta.type==='unit')onUnit?.(meta.id,meta.friendly);});
  function closest(list,target){return list.filter((u)=>u.hp>0).sort((a,b)=>(Math.abs(a.x-target.x)+Math.abs(a.y-target.y))-(Math.abs(b.x-target.x)+Math.abs(b.y-target.y)))[0]||null;}

  function update(state,{reachable=new Set(),targetable=new Set(),selectedId=null,matthiasArt=''}={}){
    for(const [key,tile] of tiles){const [x,y]=key.split(',').map(Number);if(x===INTEL.x&&y===INTEL.y&&!state.objectives.intel)tile.material=mats.intel;else if(x===EXFIL.x&&y===EXFIL.y)tile.material=mats.exfil;else if(targetable.has(key))tile.material=mats.red;else if(reachable.has(key))tile.material=mats.blue;else tile.material=mats.tile;}
    props.intel.setEnabled(!state.objectives.intel);props.intelLamp.setEnabled(!state.objectives.intel);
    for(const unit of [...state.friendlies,...state.enemies]){const friendly=state.friendlies.some((candidate)=>candidate.id===unit.id);const root=ensureUnit(unit,friendly,matthiasArt||matthiasUrl);const p=world(unit.x,unit.y,.03);root.metadata.target=new B.Vector3(p.x,unit.hp > 0 ? .03 : -.55,p.z);if(!root.metadata.initialized){root.position.copyFrom(root.metadata.target);root.metadata.initialized=true;}root.setEnabled(unit.hp>0);root.rotation.y=friendly ? -.58 : 2.38;const ring=markerFor(unit.id);ring.position.set(p.x,.055,p.z);ring.isVisible=unit.hp>0&&(unit.id===selectedId||(!friendly&&targetable.has(`${unit.x},${unit.y}`)));ring.material=friendly ? mats.cyan : mats.red;}
    if(previous){for(const enemy of state.enemies){const old=previous.enemies.find((u)=>u.id===enemy.id);if(old&&enemy.hp<old.hp){const source=state.friendlies.find((u)=>u.id===selectedId&&u.hp>0)||closest(state.friendlies,enemy);shotFx(source,enemy,true);}}for(const ally of state.friendlies){const old=previous.friendlies.find((u)=>u.id===ally.id);if(old&&ally.hp<old.hp)shotFx(closest(state.enemies,ally),ally,false);}}
    if(state.objectives.intel&&!previousObjectives.intel)pulseAt(world(INTEL.x,INTEL.y),mats.intel);
    if(state.objectives.extraction&&!previousObjectives.extraction)pulseAt(world(EXFIL.x,EXFIL.y),mats.exfil);
    previous={friendlies:state.friendlies.map((u)=>({...u})),enemies:state.enemies.map((u)=>({...u}))};previousObjectives={...state.objectives};
  }

  const started=performance.now();
  engine.runRenderLoop(()=>{
    const now=performance.now();const t=(now-started)/1000;
    for(const [id,root] of unitRoots){if(!root.isEnabled()||!root.metadata?.target)continue;const target=root.metadata.target;if(reduced){root.position.x=target.x;root.position.z=target.z;}else{root.position.x+=(target.x-root.position.x)*.13;root.position.z+=(target.z-root.position.z)*.13;}root.position.y=target.y+(reduced ? 0 : Math.sin(t*1.7+root.metadata.phase)*.018);const parts=root.metadata.parts;if(parts?.weapon&&!reduced)parts.weapon.rotation.z=-.08+Math.sin(t*1.55+root.metadata.phase)*.018;if(parts?.head&&!reduced)parts.head.position.x=Math.sin(t*.72+root.metadata.phase)*.012;const marker=markers.get(id);if(marker?.isVisible&&!reduced){const s=1+Math.sin(t*3.2+root.metadata.phase)*.035;marker.scaling.set(s,s,s);}}
    if(!reduced){props.ring.rotation.z=t*.22;props.beacon.scaling.y=.92+Math.sin(t*2.4)*.08;props.exfilLight.intensity=4.2+Math.sin(t*2.7)*.8;warmLights.forEach((light,index)=>{light.intensity=(index<2 ? 12 : 5)+Math.sin(t*3.1+index*1.7)*.45;});}
    for(let i=fx.length-1;i>=0;i-=1){const item=fx[i];const progress=(now-item.born)/item.life;if(progress>=1){item.mesh.dispose();fx.splice(i,1);continue;}if('alpha' in item.mesh)item.mesh.alpha=1-progress;const s=1+progress*.65;item.mesh.scaling.set(s,s,s);}
    scene.render();
  });

  const resize=()=>engine.resize();const ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;ro?.observe(host);window.addEventListener('resize',resize);onReady?.(`BABYLON.JS ${BABYLON_VERSION} · TACTICAL PREMIUM V1`);
  return{update,resize,destroy(){ro?.disconnect();window.removeEventListener('resize',resize);engine.stopRenderLoop();scene.dispose();engine.dispose();canvas.remove();}};
}

export { BABYLON_VERSION };
