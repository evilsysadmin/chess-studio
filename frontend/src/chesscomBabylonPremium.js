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

export const CHESSCOM_MATTHIAS_OPERATIVE_PROFILE = Object.freeze({
  identity:'pawn-core-exosuit',
  locomotion:'articulated-operative',
  pawnCoreVisible:true,
  face:'canonical-matthias',
  cap:'canonical-peaked-cap',
  palette:Object.freeze(['ivory','black','brass','oxblood']),
});

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

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

export function chesscomMovementEase(progress) {
  const p = clamp01(progress);
  return p < .5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2;
}

export function chesscomMovementDuration(distance) {
  const safeDistance = Math.max(0, Number(distance) || 0);
  return Math.round(Math.min(620, Math.max(280, 240 + safeDistance * 95)));
}

export function chesscomMovementLift(progress, steps = 2) {
  const p = clamp01(progress);
  if (p === 0 || p === 1) return 0;
  const safeSteps = Math.max(1, Math.round(Number(steps) || 1));
  const footfall = Math.abs(Math.sin(p * Math.PI * safeSteps)) * .065;
  const travelArc = Math.sin(p * Math.PI) * .035;
  return footfall + travelArc;
}

export function chesscomOperativeMovementLift(progress, steps = 2) {
  return chesscomMovementLift(progress, steps) * .18;
}

export function chesscomMoveCostLabel(cost) {
  const normalized = Math.max(1, Math.round(Number(cost) || 1));
  return `${normalized} AP`;
}

export function chesscomMuzzleWorldPosition(B, root, fallback) {
  if (!root?.metadata?.muzzle || !root?.getWorldMatrix || !B?.Vector3?.TransformCoordinates) {
    return fallback?.clone ? fallback.clone() : fallback;
  }
  root.computeWorldMatrix?.(true);
  return B.Vector3.TransformCoordinates(root.metadata.muzzle, root.getWorldMatrix());
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
  root.metadata = { phase:Math.random()*Math.PI*2,target:null,initialized:false,motion:null };
  const uniform = friendly ? mats.friendlyBody : mats.enemyBody;
  const armour = friendly ? mats.friendlyArmour : mats.enemyArmour;
  const skin = friendly ? mats.friendlyHead : mats.enemyHead;

  box(B,scene,`${id}-pelvis`,.48,.28,.30,root,uniform,0,.49,0);
  const torso = box(B,scene,`${id}-torso`,.56,.62,.34,root,uniform,0,.83,0);
  box(B,scene,`${id}-plate`,.46,.48,.08,root,armour,0,.86,-.19);
  box(B,scene,`${id}-pack`,.38,.45,.16,root,mats.pack,0,.86,.24);
  const legL = cylinder(B,scene,`${id}-leg-l`,.52,.17,root,uniform,-.14,.25,0);
  const legR = cylinder(B,scene,`${id}-leg-r`,.52,.17,root,uniform,.14,.25,0);
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
  root.metadata.parts = { torso,head,helmet,armL,armR,legL,legR,weapon:rifle.weapon };
  root.metadata.muzzle = rifle.muzzle;
  return root;
}

function createJoint(B, scene, name, parent, x, y, z) {
  const joint = new B.TransformNode(name, scene);
  joint.parent = parent;
  joint.position.set(x,y,z);
  return joint;
}

function createMatthiasOperative(B, scene, mats) {
  const root = new B.TransformNode('unit-matthias',scene);
  root.metadata = {
    phase:1.2,target:null,initialized:false,motion:null,
    operative:true,profile:CHESSCOM_MATTHIAS_OPERATIVE_PROFILE,
    recoilUntil:0,
  };

  // Mechanical pelvis and visible pawn core: Matthias is still a pawn, the suit supplies anatomy.
  box(B,scene,'matthias-pelvis-frame',.58,.18,.38,root,mats.matthiasBlack,0,.78,0);
  const pawnBody = B.MeshBuilder.CreateCylinder('matthias-pawn-core',{ height:.52,diameterTop:.34,diameterBottom:.55,tessellation:28 },scene);
  pawnBody.parent=root; pawnBody.position.set(0,1.08,0); pawnBody.material=mats.matthiasCore; pawnBody.receiveShadows=true;
  cylinder(B,scene,'matthias-core-base',.10,.58,root,mats.matthiasCoreShade,0,.81,0,28);
  cylinder(B,scene,'matthias-core-collar',.09,.42,root,mats.matthiasBrass,0,1.37,0,28);

  // Harness, armour and coat. Keep the ivory pawn mass visible through the middle.
  box(B,scene,'matthias-harness-top',.70,.10,.38,root,mats.matthiasBlack,0,1.38,.01);
  box(B,scene,'matthias-chest-strap',.12,.48,.39,root,mats.matthiasBlack,-.20,1.13,-.01);
  box(B,scene,'matthias-chest-strap-r',.12,.48,.39,root,mats.matthiasBlack,.20,1.13,-.01);
  box(B,scene,'matthias-belt',.62,.10,.40,root,mats.matthiasBrass,0,.84,0);
  box(B,scene,'matthias-belt-black',.58,.065,.41,root,mats.matthiasBlack,0,.84,-.005);
  box(B,scene,'matthias-pouch-l',.17,.22,.16,root,mats.pouch,-.24,.74,-.18);
  box(B,scene,'matthias-pouch-r',.17,.22,.16,root,mats.pouch,.24,.74,-.18);
  const coatL=box(B,scene,'matthias-coat-l',.25,.58,.08,root,mats.matthiasBlack,-.17,.55,.15);coatL.rotation.x=-.07;coatL.rotation.z=.025;
  const coatR=box(B,scene,'matthias-coat-r',.25,.58,.08,root,mats.matthiasBlack,.17,.55,.15);coatR.rotation.x=-.07;coatR.rotation.z=-.025;
  box(B,scene,'matthias-coat-trim-l',.035,.55,.085,root,mats.matthiasRed,-.285,.55,.145);
  box(B,scene,'matthias-coat-trim-r',.035,.55,.085,root,mats.matthiasRed,.285,.55,.145);

  // Head and face remain unmistakably Matthias.
  const head=createJoint(B,scene,'matthias-head-rig',root,0,1.66,0);
  const face=B.MeshBuilder.CreateSphere('matthias-face',{ diameter:.52,segments:28 },scene);face.parent=head;face.material=mats.matthiasFace;face.scaling.z=.92;face.receiveShadows=true;
  box(B,scene,'matthias-eye-l',.055,.080,.026,head,mats.matthiasEye,-.095,.015,-.245);
  box(B,scene,'matthias-eye-r',.055,.080,.026,head,mats.matthiasEye,.095,.015,-.245);
  const browL=box(B,scene,'matthias-brow-l',.14,.030,.025,head,mats.matthiasEye,-.095,.115,-.248);browL.rotation.z=-.17;
  const browR=box(B,scene,'matthias-brow-r',.14,.030,.025,head,mats.matthiasEye,.095,.115,-.248);browR.rotation.z=.17;
  const mouthL=box(B,scene,'matthias-mouth-l',.10,.022,.022,head,mats.matthiasMouth,-.045,-.105,-.251);mouthL.rotation.z=-.12;
  const mouthR=box(B,scene,'matthias-mouth-r',.10,.022,.022,head,mats.matthiasMouth,.045,-.105,-.251);mouthR.rotation.z=.12;

  const cap=createJoint(B,scene,'matthias-cap-rig',head,0,.22,.005);
  const capTop=cylinder(B,scene,'matthias-cap-top',.11,.50,cap,mats.matthiasBlack,0,.10,0,32);capTop.scaling.z=.82;
  const capBand=cylinder(B,scene,'matthias-cap-band',.055,.54,cap,mats.matthiasRed,0,.045,0,32);capBand.scaling.z=.83;
  const capTrim=cylinder(B,scene,'matthias-cap-trim',.025,.56,cap,mats.matthiasBrass,0,.010,0,32);capTrim.scaling.z=.83;
  box(B,scene,'matthias-cap-brim',.62,.035,.18,cap,mats.matthiasBlack,0,-.015,-.13).rotation.x=.03;
  const badge=cylinder(B,scene,'matthias-cap-badge',.025,.11,cap,mats.matthiasBrass,0,.065,-.235,20);badge.rotation.x=Math.PI/2;

  // Exosuit shoulders and articulated arms.
  for (const side of [-1,1]) {
    box(B,scene,`matthias-shoulder-${side<0?'l':'r'}`,.24,.19,.40,root,mats.matthiasBlack2,side*.43,1.34,-.01);
    box(B,scene,`matthias-shoulder-trim-${side<0?'l':'r'}`,.25,.045,.41,root,mats.matthiasBrass,side*.43,1.415,-.012);
  }
  const armL=createJoint(B,scene,'matthias-arm-l-rig',root,-.43,1.30,-.02);
  const armR=createJoint(B,scene,'matthias-arm-r-rig',root,.43,1.30,-.02);
  for (const [arm,side] of [[armL,-1],[armR,1]]) {
    cylinder(B,scene,`matthias-upper-arm-${side<0?'l':'r'}`,.34,.15,arm,mats.matthiasBlack2,0,-.16,0,14);
    box(B,scene,`matthias-elbow-${side<0?'l':'r'}`,.17,.13,.18,arm,mats.matthiasBrass,0,-.34,-.025);
    const fore=cylinder(B,scene,`matthias-forearm-${side<0?'l':'r'}`,.31,.14,arm,mats.matthiasBlack,0,-.49,-.10,14);fore.rotation.x=.28;
    box(B,scene,`matthias-glove-${side<0?'l':'r'}`,.17,.16,.19,arm,mats.glove,0,-.63,-.18);
  }
  armL.rotation.x=.42; armL.rotation.z=-.08;
  armR.rotation.x=-.28; armR.rotation.z=.10;

  // Pelvis-driven legs: the suit walks; the pawn core no longer hops across the map.
  const legL=createJoint(B,scene,'matthias-leg-l-rig',root,-.18,.76,0);
  const legR=createJoint(B,scene,'matthias-leg-r-rig',root,.18,.76,0);
  for (const [leg,side] of [[legL,-1],[legR,1]]) {
    cylinder(B,scene,`matthias-thigh-${side<0?'l':'r'}`,.38,.18,leg,mats.matthiasBlack2,0,-.18,0,16);
    box(B,scene,`matthias-knee-${side<0?'l':'r'}`,.22,.17,.24,leg,mats.matthiasBrass,0,-.39,-.04);
    cylinder(B,scene,`matthias-shin-${side<0?'l':'r'}`,.35,.16,leg,mats.matthiasBlack,0,-.57,0,16);
    box(B,scene,`matthias-boot-${side<0?'l':'r'}`,.25,.16,.40,leg,mats.boot,0,-.78,-.07);
    box(B,scene,`matthias-boot-trim-${side<0?'l':'r'}`,.255,.035,.405,leg,mats.matthiasBrass,0,-.715,-.07);
  }

  const rifle=createRifle(B,scene,root,mats,true);
  rifle.weapon.scaling.set(.84,.84,.84);
  rifle.weapon.position.set(.22,1.08,-.33);
  rifle.weapon.rotation.z=-.04;
  const suppressor=cylinder(B,scene,'matthias-suppressor',.30,.065,rifle.weapon,mats.matthiasBlack,.91,0,0,16);suppressor.rotation.z=Math.PI/2;
  box(B,scene,'matthias-rifle-brass',.10,.035,.145,rifle.weapon,mats.matthiasBrass,.23,.075,0);

  root.metadata.parts={ torso:pawnBody,head,helmet:cap,armL,armR,legL,legR,weapon:rifle.weapon,coatL,coatR };
  root.metadata.weaponBaseX=.22;
  root.metadata.muzzle=new B.Vector3(1.13,1.08,-.33);
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
  tile.position.set(p.x,p.y,p.z);tile.material=mats.tile;tile.isPickable=true;tile.metadata={type:'tile',x,y,moveCost:null};return tile;
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

function moveMaterialForCost(mats, cost) {
  if (cost <= 1) return mats.moveNear;
  if (cost === 2) return mats.moveMid;
  return mats.moveFar;
}

function moveColorForCost(cost) {
  if (cost <= 1) return '#63e7ff';
  if (cost === 2) return '#6aa7ff';
  return '#f1c15b';
}

function paintMoveBadge(texture, cost) {
  const ctx = texture.getContext();
  const size = texture.getSize();
  ctx.clearRect(0,0,size.width,size.height);
  ctx.fillStyle='rgba(3,12,19,.88)';
  ctx.fillRect(8,8,size.width-16,size.height-16);
  ctx.strokeStyle=moveColorForCost(cost);
  ctx.lineWidth=7;
  ctx.strokeRect(8,8,size.width-16,size.height-16);
  ctx.fillStyle='#eefbff';
  ctx.font='700 60px monospace';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(chesscomMoveCostLabel(cost),size.width/2,size.height/2+2);
  texture.update(false);
}

function createReachableIndicator(B,scene,mats,glow,key,cost) {
  const root=new B.TransformNode(`move-indicator-${key}`,scene);
  root.metadata={cost,phase:Math.random()*Math.PI*2};
  const ring=B.MeshBuilder.CreateTorus(`move-ring-${key}`,{diameter:1.14,thickness:.065,tessellation:32},scene);
  ring.parent=root;ring.rotation.x=Math.PI/2;ring.position.y=.085;ring.material=moveMaterialForCost(mats,cost);ring.isPickable=false;glow.addIncludedOnlyMesh(ring);
  const disc=B.MeshBuilder.CreateDisc(`move-disc-${key}`,{radius:.34,tessellation:28},scene);
  disc.parent=root;disc.rotation.x=Math.PI/2;disc.position.y=.052;disc.material=moveMaterialForCost(mats,cost);disc.isPickable=false;disc.visibility=.42;
  const badge=B.MeshBuilder.CreatePlane(`move-badge-${key}`,{width:.76,height:.40},scene);
  badge.parent=root;badge.position.y=.39;badge.billboardMode=B.Mesh.BILLBOARDMODE_ALL;badge.isPickable=false;
  const texture=new B.DynamicTexture(`move-badge-texture-${key}`,{width:256,height:128},scene,false);
  texture.hasAlpha=true;paintMoveBadge(texture,cost);
  const badgeMat=new B.StandardMaterial(`move-badge-mat-${key}`,scene);
  badgeMat.diffuseTexture=texture;badgeMat.opacityTexture=texture;badgeMat.emissiveTexture=texture;badgeMat.useAlphaFromDiffuseTexture=true;badgeMat.disableLighting=true;badgeMat.backFaceCulling=false;badgeMat.specularColor=B.Color3.Black();badge.material=badgeMat;
  root.metadata.ring=ring;root.metadata.disc=disc;root.metadata.badge=badge;root.metadata.texture=texture;
  return root;
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
    matthiasCore:material(B,scene,'matthias-core','#e9dcc2'),matthiasCoreShade:material(B,scene,'matthias-core-shade','#c1ad89'),matthiasFace:material(B,scene,'matthias-face','#efe0c5'),matthiasBlack:material(B,scene,'matthias-black','#101315'),matthiasBlack2:material(B,scene,'matthias-black-2','#22272c'),matthiasBrass:material(B,scene,'matthias-brass','#b98535'),matthiasRed:material(B,scene,'matthias-red','#681c1b'),matthiasEye:material(B,scene,'matthias-eye','#080909'),matthiasMouth:material(B,scene,'matthias-mouth','#3b2f28'),
    enemyVisor:material(B,scene,'enemy-visor','#421111','#ff2929'),eliteVisor:material(B,scene,'elite-visor','#6d1515','#ff1717'),
    blue:material(B,scene,'reachable','#12394e','#0872a4',.74),cyan:material(B,scene,'selected','#155269','#13b6ef',.88),red:material(B,scene,'target','#601818','#df2626',.87),intel:material(B,scene,'intel','#88651b','#ffca38',.92),exfil:material(B,scene,'exfil','#0b607b','#12bdf4',.88),intelCase:material(B,scene,'intel-case','#403b25'),
    moveNear:material(B,scene,'move-near','#155b6a','#19c9ee',.90),moveMid:material(B,scene,'move-mid','#214d78','#388fe6',.88),moveFar:material(B,scene,'move-far','#725927','#d8a93d',.88),
    muzzle:material(B,scene,'muzzle','#ffb642','#ffad25'),impact:material(B,scene,'impact','#ffdf9b','#ff9e35'),
  };
  mats.matthiasBrass.specularColor=new B.Color3(.72,.54,.22);
  mats.matthiasCore.specularColor=new B.Color3(.24,.21,.17);

  const ground=makeWorldBox(B,scene,'compound-ground',{w:MAP_W*TILE+3.4,d:MAP_H*TILE+3.2,h:.18},{x:0,y:-.18,z:0},mats.ground);ground.receiveShadows=true;
  makeWorldBox(B,scene,'road-a',{w:MAP_W*TILE+1,d:2.2,h:.025},{x:0,y:.015,z:2.55},mats.road);
  makeWorldBox(B,scene,'road-b',{w:2.5,d:MAP_H*TILE+1,h:.025},{x:4.45,y:.017,z:0},mats.road);
  const warmA=new B.PointLight('warm-a',new B.Vector3(-4.8,3.2,-1.2),scene);warmA.diffuse=new B.Color3(1,.50,.18);warmA.intensity=13;warmA.range=7;warmLights.push(warmA);
  const warmB=new B.PointLight('warm-b',new B.Vector3(5.6,3.0,2.6),scene);warmB.diffuse=new B.Color3(1,.39,.13);warmB.intensity=11;warmB.range=6.5;warmLights.push(warmB);
  addScenery(B,scene,mats,shadowGenerator,warmLights);

  const tiles=new Map();for(let y=0;y<MAP_H;y+=1)for(let x=0;x<MAP_W;x+=1)tiles.set(`${x},${y}`,createTile(B,scene,x,y,mats));
  const glow=new B.GlowLayer('ops-glow',scene,{blurKernelSize:coarse ? 16 : 28});glow.intensity=.72;
  const props=createMissionProps(B,scene,mats,glow);
  const unitRoots=new Map();const markers=new Map();const reachableIndicators=new Map();const fx=[];let matthiasUrl='';let previous=null;let previousObjectives={intel:false,extraction:false,target:false};

  function markerFor(id){if(markers.has(id))return markers.get(id);const ring=B.MeshBuilder.CreateTorus(`marker-${id}`,{diameter:1.18,thickness:.05,tessellation:32},scene);ring.rotation.x=Math.PI/2;ring.material=mats.cyan;ring.isVisible=false;glow.addIncludedOnlyMesh(ring);markers.set(id,ring);return ring;}
  function ensureUnit(unit,friendly,matthiasArt){if(unitRoots.has(unit.id))return unitRoots.get(unit.id);let root;if(unit.id==='matthias'){if(matthiasArt)matthiasUrl=matthiasArt;root=createMatthiasOperative(B,scene,mats);}else root=createTacticalAgent(B,scene,unit.id,friendly,unit.elite,mats);root.getChildMeshes().forEach((mesh)=>shadowGenerator.addShadowCaster(mesh));unitRoots.set(unit.id,root);return root;}
  function ensureReachableIndicator(tile){const key=`${tile.x},${tile.y}`;let indicator=reachableIndicators.get(key);if(!indicator){indicator=createReachableIndicator(B,scene,mats,glow,key,tile.cost);reachableIndicators.set(key,indicator);}if(indicator.metadata.cost!==tile.cost){indicator.metadata.cost=tile.cost;indicator.metadata.ring.material=moveMaterialForCost(mats,tile.cost);indicator.metadata.disc.material=moveMaterialForCost(mats,tile.cost);paintMoveBadge(indicator.metadata.texture,tile.cost);}return indicator;}
  function pushFx(mesh,life=260){mesh.isPickable=false;fx.push({mesh,born:performance.now(),life});return mesh;}
  function shotFx(source,target,friendly=true,rounds=1){if(!source||!target||reduced)return;const sourceRoot=unitRoots.get(source.id);if(sourceRoot?.metadata)sourceRoot.metadata.recoilUntil=performance.now()+135;const a=world(source.x,source.y,1.0);const fallback=new B.Vector3(a.x,a.y,a.z);const start=chesscomMuzzleWorldPosition(B,sourceRoot,fallback);const b=world(target.x,target.y,.95);const end=new B.Vector3(b.x,b.y,b.z);const muzzle=B.MeshBuilder.CreateSphere('muzzle-flash',{diameter:.25,segments:8},scene);muzzle.position.copyFrom(start);muzzle.material=mats.muzzle;glow.addIncludedOnlyMesh(muzzle);pushFx(muzzle,115);const count=Math.min(5,Math.max(1,Math.round(Number(rounds)||1)));for(let index=0;index<count;index+=1){const spread=(index-(count-1)/2)*.035;const tracerEnd=end.clone();tracerEnd.y+=spread;tracerEnd.z+=index%2 ? spread*.65 : -spread*.65;const line=B.MeshBuilder.CreateLines('tracer',{points:[start,tracerEnd]},scene);line.color=friendly ? new B.Color3(1,.72,.26) : new B.Color3(1,.22,.15);line.alpha=.92;pushFx(line,130+index*18);}const hit=B.MeshBuilder.CreateSphere('impact',{diameter:.18,segments:7},scene);hit.position.copyFrom(end);hit.material=mats.impact;glow.addIncludedOnlyMesh(hit);pushFx(hit,220);}
  function pulseAt(pos,mat){const ring=B.MeshBuilder.CreateTorus('objective-pulse',{diameter:1.4,thickness:.045,tessellation:32},scene);ring.rotation.x=Math.PI/2;ring.position.set(pos.x,.075,pos.z);ring.material=mat;glow.addIncludedOnlyMesh(ring);pushFx(ring,650);}

  scene.onPointerObservable.add((pointerInfo)=>{const pick=pointerInfo.pickInfo;const meta=pick?.pickedMesh?.metadata;if(!meta){if(pointerInfo.type===B.PointerEventTypes.POINTERMOVE)onHover?.(null);return;}if(pointerInfo.type===B.PointerEventTypes.POINTERMOVE)onHover?.(meta);if(pointerInfo.type!==B.PointerEventTypes.POINTERPICK)return;if(meta.type==='tile')onTile?.(meta.x,meta.y);if(meta.type==='unit')onUnit?.(meta.id,meta.friendly);});
  function closest(list,target){return list.filter((u)=>u.hp>0).sort((a,b)=>(Math.abs(a.x-target.x)+Math.abs(a.y-target.y))-(Math.abs(b.x-target.x)+Math.abs(b.y-target.y)))[0]||null;}

  function update(state,{reachable=new Set(),reachableTiles=[],targetable=new Set(),selectedId=null,targetId=null,matthiasArt=''}={}){
    const reachableCosts=new Map(reachableTiles.map((tile)=>[`${tile.x},${tile.y}`,tile.cost]));
    for(const [key,tile] of tiles){const [x,y]=key.split(',').map(Number);const moveCost=reachableCosts.get(key);tile.metadata.moveCost=moveCost??null;if(x===INTEL.x&&y===INTEL.y&&!state.objectives.intel)tile.material=mats.intel;else if(x===EXFIL.x&&y===EXFIL.y)tile.material=mats.exfil;else if(targetable.has(key))tile.material=mats.red;else if(moveCost)tile.material=moveMaterialForCost(mats,moveCost);else if(reachable.has(key))tile.material=mats.blue;else tile.material=mats.tile;}
    for(const indicator of reachableIndicators.values())indicator.setEnabled(false);
    for(const tile of reachableTiles){const indicator=ensureReachableIndicator(tile);const p=world(tile.x,tile.y,.03);indicator.position.set(p.x,0,p.z);indicator.setEnabled(true);}
    props.intel.setEnabled(!state.objectives.intel);props.intelLamp.setEnabled(!state.objectives.intel);
    for(const unit of [...state.friendlies,...state.enemies]){const friendly=state.friendlies.some((candidate)=>candidate.id===unit.id);const root=ensureUnit(unit,friendly,matthiasArt||matthiasUrl);const p=world(unit.x,unit.y,.03);const nextTarget=new B.Vector3(p.x,unit.hp > 0 ? .03 : -.55,p.z);const previousTarget=root.metadata.target;const changed=!previousTarget||Math.abs(previousTarget.x-nextTarget.x)>.001||Math.abs(previousTarget.z-nextTarget.z)>.001;if(!root.metadata.initialized){root.position.copyFrom(nextTarget);root.metadata.initialized=true;root.metadata.motion=null;}else if(changed&&unit.hp>0){const start=root.position.clone();const distance=Math.hypot(nextTarget.x-start.x,nextTarget.z-start.z);root.metadata.motion={start,target:nextTarget.clone(),startedAt:performance.now(),duration:chesscomMovementDuration(distance),steps:Math.max(2,Math.round((distance/TILE)*2))};}root.metadata.target=nextTarget;root.metadata.baseYaw=friendly ? -.58 : 2.38;root.setEnabled(unit.hp>0);root.rotation.y=root.metadata.baseYaw;const ring=markerFor(unit.id);ring.position.set(p.x,.055,p.z);ring.isVisible=unit.hp>0&&(unit.id===selectedId||(!friendly&&(unit.id===targetId||targetable.has(`${unit.x},${unit.y}`))));ring.material=friendly ? mats.cyan : mats.red;}
    if(previous){for(const enemy of state.enemies){const old=previous.enemies.find((u)=>u.id===enemy.id);if(old&&enemy.hp<old.hp){const ammoShooters=state.friendlies.filter((unit)=>{const prior=previous.friendlies.find((candidate)=>candidate.id===unit.id);return prior&&unit.hp>0&&Number.isFinite(unit.ammo)&&Number.isFinite(prior.ammo)&&unit.ammo<prior.ammo;});const source=ammoShooters.sort((a,b)=>closest([a],enemy)===a?-1:closest([b],enemy)===b?1:0)[0]||state.friendlies.find((u)=>u.id===selectedId&&u.hp>0)||closest(state.friendlies,enemy);const priorSource=previous.friendlies.find((u)=>u.id===source?.id);const rounds=priorSource&&source ? Math.max(1,priorSource.ammo-source.ammo) : 1;shotFx(source,enemy,true,rounds);}}for(const ally of state.friendlies){const old=previous.friendlies.find((u)=>u.id===ally.id);if(old&&ally.hp<old.hp)shotFx(closest(state.enemies,ally),ally,false,1);}}
    if(state.objectives.intel&&!previousObjectives.intel)pulseAt(world(INTEL.x,INTEL.y),mats.intel);
    if(state.objectives.extraction&&!previousObjectives.extraction)pulseAt(world(EXFIL.x,EXFIL.y),mats.exfil);
    previous={friendlies:state.friendlies.map((u)=>({...u})),enemies:state.enemies.map((u)=>({...u}))};previousObjectives={...state.objectives};
  }

  const started=performance.now();
  engine.runRenderLoop(()=>{
    const now=performance.now();const t=(now-started)/1000;
    for(const [id,root] of unitRoots){
      if(!root.isEnabled()||!root.metadata?.target)continue;
      const target=root.metadata.target;const motion=root.metadata.motion;const phase=root.metadata.phase||0;const operative=Boolean(root.metadata.operative);const idleBob=reduced?0:Math.sin(t*1.7+phase)*(operative?.006:.012);let moveWave=0;
      if(reduced){root.position.copyFrom(target);root.metadata.motion=null;root.rotation.z=0;}
      else if(motion){const raw=clamp01((now-motion.startedAt)/motion.duration);const eased=chesscomMovementEase(raw);moveWave=Math.sin(raw*Math.PI*motion.steps);root.position.x=motion.start.x+(motion.target.x-motion.start.x)*eased;root.position.z=motion.start.z+(motion.target.z-motion.start.z)*eased;root.position.y=motion.target.y+(operative?chesscomOperativeMovementLift(raw,motion.steps):chesscomMovementLift(raw,motion.steps));root.rotation.z=moveWave*(operative?.007:.018);if(raw>=1){root.metadata.motion=null;root.position.copyFrom(motion.target);root.position.y=motion.target.y+idleBob;root.rotation.z=0;moveWave=0;}}
      else{root.position.x=target.x;root.position.z=target.z;root.position.y=target.y+idleBob;root.rotation.z=0;}
      const parts=root.metadata.parts;
      if(operative&&!reduced){
        const recoil=root.metadata.recoilUntil>now?1-(root.metadata.recoilUntil-now)/135:0;
        if(parts?.weapon){parts.weapon.rotation.z=-.04+(motion?moveWave*.018:Math.sin(t*1.55+phase)*.008)-recoil*.055;parts.weapon.position.x=(root.metadata.weaponBaseX||.22)-recoil*.055;}
        if(parts?.armL){parts.armL.rotation.x=.42+moveWave*.11-recoil*.025;parts.armL.rotation.z=-.08+moveWave*.035;}
        if(parts?.armR){parts.armR.rotation.x=-.28-moveWave*.09-recoil*.07;parts.armR.rotation.z=.10-moveWave*.025;}
        if(parts?.legL){parts.legL.rotation.x=moveWave*.48;parts.legL.rotation.z=-Math.abs(moveWave)*.025;}
        if(parts?.legR){parts.legR.rotation.x=-moveWave*.48;parts.legR.rotation.z=Math.abs(moveWave)*.025;}
        if(parts?.head){parts.head.position.x=Math.sin(t*.72+phase)*.007;parts.head.rotation.z=motion?moveWave*.012:Math.sin(t*.55+phase)*.008;}
        if(parts?.coatL)parts.coatL.rotation.x=-.07-Math.abs(moveWave)*.10;
        if(parts?.coatR)parts.coatR.rotation.x=-.07-Math.abs(moveWave)*.08;
      }else{
        if(parts?.weapon&&!reduced)parts.weapon.rotation.z=-.08+(motion?moveWave*.055:Math.sin(t*1.55+phase)*.018);
        if(parts?.armL&&!reduced)parts.armL.rotation.x=.18+moveWave*.28;
        if(parts?.armR&&!reduced)parts.armR.rotation.x=-.18-moveWave*.28;
        if(parts?.legL&&!reduced)parts.legL.rotation.x=moveWave*.24;
        if(parts?.legR&&!reduced)parts.legR.rotation.x=-moveWave*.24;
        if(parts?.head&&!reduced)parts.head.position.x=Math.sin(t*.72+phase)*.012;
      }
      const marker=markers.get(id);if(marker?.isVisible&&!reduced){const s=1+Math.sin(t*3.2+phase)*.035;marker.scaling.set(s,s,s);}
    }
    if(!reduced){for(const indicator of reachableIndicators.values()){if(!indicator.isEnabled())continue;const pulse=1+Math.sin(t*3.1+indicator.metadata.phase)*.045;indicator.metadata.ring.scaling.set(pulse,pulse,pulse);indicator.metadata.badge.position.y=.39+Math.sin(t*2.2+indicator.metadata.phase)*.018;}props.ring.rotation.z=t*.22;props.beacon.scaling.y=.92+Math.sin(t*2.4)*.08;props.exfilLight.intensity=4.2+Math.sin(t*2.7)*.8;warmLights.forEach((light,index)=>{light.intensity=(index<2 ? 12 : 5)+Math.sin(t*3.1+index*1.7)*.45;});}
    for(let i=fx.length-1;i>=0;i-=1){const item=fx[i];const progress=(now-item.born)/item.life;if(progress>=1){item.mesh.dispose();fx.splice(i,1);continue;}if('alpha' in item.mesh)item.mesh.alpha=1-progress;const s=1+progress*.65;item.mesh.scaling.set(s,s,s);}
    scene.render();
  });

  const resize=()=>engine.resize();const ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;ro?.observe(host);window.addEventListener('resize',resize);onReady?.(`BABYLON.JS ${BABYLON_VERSION} · TACTICAL PREMIUM V1`);
  return{update,resize,destroy(){ro?.disconnect();window.removeEventListener('resize',resize);engine.stopRenderLoop();scene.dispose();engine.dispose();canvas.remove();}};
}

export { BABYLON_VERSION };
