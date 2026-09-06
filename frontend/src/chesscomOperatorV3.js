import './components/ChesscomOperatorV3.css';

export const CHESSCOM_OPERATOR_V3 = Object.freeze({
  identity:'operator-v3',
  cameraBeta:.90,
  cameraTargetY:.42,
  cameraTargetZ:.46,
});

export function chesscomOperatorV3Profile(id, friendly = true) {
  const normalized = String(id || '').toLowerCase();
  if (normalized === 'matthias') return Object.freeze({
    id:'matthias', identity:'matthias-field-operative-v3', friendly:true,
    accent:'#b78a3f', cloth:'#171b1d', armour:'#272d30', compact:false,
  });
  if (!friendly) return Object.freeze({
    id:normalized || 'hostile', identity:'hostile-operator-v3', friendly:false,
    accent:'#8e4938', cloth:'#2b2926', armour:'#1b1d1e', compact:false,
  });
  if (normalized === 'sven') return Object.freeze({
    id:'sven', identity:'scout-operator-v3', friendly:true,
    accent:'#4f8793', cloth:'#263135', armour:'#20282b', compact:true,
  });
  return Object.freeze({
    id:normalized || 'dieter', identity:'rifleman-operator-v3', friendly:true,
    accent:'#8f7953', cloth:'#34342e', armour:'#222726', compact:false,
  });
}

function material(scene, name) {
  return scene.getMaterialByName?.(name) || scene.materials?.find?.((candidate) => candidate.name === name) || null;
}

function cloneMaterial(B, scene, sourceName, cloneName, diffuseHex, specularPower = null) {
  const source = material(scene, sourceName);
  const clone = source?.clone?.(cloneName) || new B.StandardMaterial(cloneName, scene);
  clone.name = cloneName;
  if (diffuseHex && clone.diffuseColor) clone.diffuseColor = B.Color3.FromHexString(diffuseHex);
  if (specularPower != null && 'specularPower' in clone) clone.specularPower = specularPower;
  return clone;
}

function rootFriendly(root) {
  const tagged = root?.getChildMeshes?.().find?.((mesh) => mesh?.metadata?.type === 'unit');
  return tagged?.metadata?.friendly !== false;
}

function tag(mesh, id, friendly) {
  if (!mesh) return mesh;
  mesh.metadata = { ...(mesh.metadata || {}), type:'unit', id, friendly };
  mesh.isPickable = true;
  mesh.receiveShadows = true;
  return mesh;
}

function capsule(B, scene, name, parent, mat, spec, id, friendly, disposables) {
  const mesh = B.MeshBuilder.CreateCapsule
    ? B.MeshBuilder.CreateCapsule(name, {
      height:spec.height,
      radius:spec.radius,
      tessellation:spec.tessellation || 18,
      subdivisions:2,
    }, scene)
    : B.MeshBuilder.CreateCylinder(name, {
      height:spec.height,
      diameter:spec.radius * 2,
      tessellation:spec.tessellation || 18,
    }, scene);
  mesh.parent = parent || null;
  mesh.position.set(spec.x || 0, spec.y || 0, spec.z || 0);
  if (spec.rx != null || spec.ry != null || spec.rz != null) {
    mesh.rotation.set(spec.rx || 0, spec.ry || 0, spec.rz || 0);
  }
  if (spec.sx != null || spec.sy != null || spec.sz != null) {
    mesh.scaling.set(spec.sx ?? 1, spec.sy ?? 1, spec.sz ?? 1);
  }
  mesh.material = mat;
  tag(mesh,id,friendly);
  disposables.push(mesh);
  return mesh;
}

function sphere(B, scene, name, parent, mat, spec, id, friendly, disposables) {
  const mesh = B.MeshBuilder.CreateSphere(name,{ diameter:spec.diameter,segments:spec.segments || 18 },scene);
  mesh.parent = parent || null;
  mesh.position.set(spec.x || 0,spec.y || 0,spec.z || 0);
  mesh.scaling.set(spec.sx ?? 1,spec.sy ?? 1,spec.sz ?? 1);
  mesh.material = mat;
  tag(mesh,id,friendly);
  disposables.push(mesh);
  return mesh;
}

function cylinder(B, scene, name, parent, mat, spec, id, friendly, disposables) {
  const mesh = B.MeshBuilder.CreateCylinder(name,{
    height:spec.height,
    diameter:spec.diameter,
    diameterTop:spec.diameterTop,
    diameterBottom:spec.diameterBottom,
    tessellation:spec.tessellation || 24,
  },scene);
  mesh.parent = parent || null;
  mesh.position.set(spec.x || 0,spec.y || 0,spec.z || 0);
  if (spec.rx != null || spec.ry != null || spec.rz != null) mesh.rotation.set(spec.rx || 0,spec.ry || 0,spec.rz || 0);
  mesh.scaling.set(spec.sx ?? 1,spec.sy ?? 1,spec.sz ?? 1);
  mesh.material = mat;
  tag(mesh,id,friendly);
  disposables.push(mesh);
  return mesh;
}

function torus(B, scene, name, parent, mat, spec, id, friendly, disposables) {
  const mesh = B.MeshBuilder.CreateTorus(name,{ diameter:spec.diameter,thickness:spec.thickness,tessellation:spec.tessellation || 24 },scene);
  mesh.parent = parent || null;
  mesh.position.set(spec.x || 0,spec.y || 0,spec.z || 0);
  mesh.rotation.set(spec.rx || 0,spec.ry || 0,spec.rz || 0);
  mesh.material = mat;
  tag(mesh,id,friendly);
  disposables.push(mesh);
  return mesh;
}

function makeInvisibleMaterial(B, scene, disposables) {
  const mat = new B.StandardMaterial('operator-v3-invisible',scene);
  mat.alpha = 0;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  disposables.push(mat);
  return mat;
}

function hideMeshes(scene, names, invisible, restorers) {
  names.forEach((name) => {
    const mesh = scene.getMeshByName?.(name);
    if (!mesh || mesh.material === invisible) return;
    const old = mesh.material;
    mesh.material = invisible;
    restorers.push(() => { if (!mesh.isDisposed?.()) mesh.material = old; });
  });
}

function addMatthiasV3(B, scene, root, disposables, restorers, invisible) {
  const id = 'matthias';
  const friendly = true;
  const parts = root.metadata?.parts || {};
  const black = cloneMaterial(B,scene,'matthias-black','operator-v3-matthias-coat','#15191b',20);
  const black2 = cloneMaterial(B,scene,'matthias-black-2','operator-v3-matthias-trouser','#202527',24);
  const brass = cloneMaterial(B,scene,'matthias-brass','operator-v3-matthias-brass','#a77a34',116);
  const red = cloneMaterial(B,scene,'matthias-red','operator-v3-matthias-red','#632425',38);
  const glove = cloneMaterial(B,scene,'glove','operator-v3-matthias-glove','#111517',18);
  const boot = cloneMaterial(B,scene,'boot','operator-v3-matthias-boot','#101315',22);
  disposables.push(black,black2,brass,red,glove,boot);

  hideMeshes(scene,[
    'matthias-pelvis-frame','matthias-harness-top','matthias-chest-strap-l','matthias-chest-strap-r',
    'matthias-shoulder-l','matthias-shoulder-r','matthias-shoulder-trim-l','matthias-shoulder-trim-r',
    'matthias-upper-arm-l','matthias-upper-arm-r','matthias-elbow-l','matthias-elbow-r',
    'matthias-forearm-l','matthias-forearm-r','matthias-glove-l','matthias-glove-r',
    'matthias-thigh-l','matthias-thigh-r','matthias-knee-l','matthias-knee-r',
    'matthias-shin-l','matthias-shin-r','matthias-boot-l','matthias-boot-r',
    'matthias-boot-trim-l','matthias-boot-trim-r','matthias-coat-l','matthias-coat-r',
    'matthias-coat-trim-l','matthias-coat-trim-r','matthias-holster',
  ],invisible,restorers);

  // Keep the canonical pawn core, face and peaked cap visible. Replace the exosuit
  // around them with a cloth field coat and rounded, animated limbs.
  const coat = cylinder(B,scene,'operator-v3-matthias-coat',root,black,{
    height:.72,diameterTop:.48,diameterBottom:.70,tessellation:32,y:.76,z:.035,sz:.78,
  },id,friendly,disposables);
  coat.position.y = .68;
  cylinder(B,scene,'operator-v3-matthias-coat-collar',root,brass,{height:.055,diameter:.47,tessellation:28,y:1.36},id,friendly,disposables);
  torus(B,scene,'operator-v3-matthias-coat-piping',root,red,{diameter:.61,thickness:.018,tessellation:28,y:.83,rx:Math.PI/2},id,friendly,disposables);

  for (const [part,side] of [[parts.armL,-1],[parts.armR,1]]) {
    if (!part) continue;
    capsule(B,scene,`operator-v3-matthias-sleeve-${side<0?'l':'r'}`,part,black2,{
      height:.56,radius:.105,rx:Math.PI/2,z:-.25,
    },id,friendly,disposables);
    sphere(B,scene,`operator-v3-matthias-hand-${side<0?'l':'r'}`,part,glove,{
      diameter:.18,y:-.02,z:-.55,sx:.9,sy:.92,sz:1.08,
    },id,friendly,disposables);
  }

  for (const [part,side] of [[parts.legL,-1],[parts.legR,1]]) {
    if (!part) continue;
    capsule(B,scene,`operator-v3-matthias-trouser-${side<0?'l':'r'}`,part,black2,{
      height:.64,radius:.105,y:-.36,
    },id,friendly,disposables);
    capsule(B,scene,`operator-v3-matthias-boot-${side<0?'l':'r'}`,part,boot,{
      height:.34,radius:.125,rx:Math.PI/2,y:-.74,z:-.10,sz:1.18,
    },id,friendly,disposables);
  }

  // Less brass armour, more officer detailing.
  torus(B,scene,'operator-v3-matthias-cuff-l',parts.armL,brass,{diameter:.20,thickness:.018,tessellation:20,z:-.47,rx:Math.PI/2},id,friendly,disposables);
  torus(B,scene,'operator-v3-matthias-cuff-r',parts.armR,brass,{diameter:.20,thickness:.018,tessellation:20,z:-.47,rx:Math.PI/2},id,friendly,disposables);
  root.metadata.visualIdentity = 'matthias-field-operative-v3';
}

function addMercenaryV3(B, scene, root, id, friendly, profile, disposables, restorers, invisible) {
  const parts = root.metadata?.parts || {};
  const bodyName = friendly ? 'friendly-body' : 'enemy-body';
  const armourName = friendly ? 'friendly-armour' : 'enemy-armour';
  const skinName = friendly ? 'friendly-head' : 'enemy-head';
  const body = cloneMaterial(B,scene,bodyName,`operator-v3-${id}-cloth`,profile.cloth,18);
  const armour = cloneMaterial(B,scene,armourName,`operator-v3-${id}-armour`,profile.armour,72);
  const skin = cloneMaterial(B,scene,skinName,`operator-v3-${id}-skin`,null,46);
  const accent = new B.StandardMaterial(`operator-v3-${id}-accent`,scene);
  accent.diffuseColor = B.Color3.FromHexString(profile.accent);
  accent.specularColor = new B.Color3(.16,.15,.12);
  accent.specularPower = 44;
  const boot = cloneMaterial(B,scene,'boot',`operator-v3-${id}-boot`,'#111416',20);
  const glove = cloneMaterial(B,scene,'glove',`operator-v3-${id}-glove`,'#141719',18);
  disposables.push(body,armour,skin,accent,boot,glove);

  hideMeshes(scene,[
    `${id}-pelvis`,`${id}-torso`,`${id}-plate`,`${id}-arm-l`,`${id}-arm-r`,
    `${id}-glove-l`,`${id}-glove-r`,`${id}-belt`,`${id}-pouch-l`,`${id}-pouch-r`,
    `${id}-leg-l`,`${id}-leg-r`,`${id}-boot-l`,`${id}-boot-r`,
  ],invisible,restorers);

  capsule(B,scene,`operator-v3-${id}-torso`,root,body,{
    height:profile.compact ? .66 : .72,radius:profile.compact ? .255 : .285,y:.84,sz:.68,
  },id,friendly,disposables);
  capsule(B,scene,`operator-v3-${id}-vest`,root,armour,{
    height:.50,radius:profile.compact ? .235 : .255,y:.88,z:-.035,sz:.52,
  },id,friendly,disposables);
  capsule(B,scene,`operator-v3-${id}-pelvis`,root,body,{height:.30,radius:.235,y:.51,sz:.72},id,friendly,disposables);

  for (const [part,side] of [[parts.armL,-1],[parts.armR,1]]) {
    if (!part) continue;
    capsule(B,scene,`operator-v3-${id}-arm-${side<0?'l':'r'}`,part,body,{
      height:.51,radius:.085,rx:Math.PI/2,z:-.25,
    },id,friendly,disposables);
    sphere(B,scene,`operator-v3-${id}-hand-${side<0?'l':'r'}`,part,glove,{
      diameter:.16,z:-.52,sx:.88,sy:.90,sz:1.08,
    },id,friendly,disposables);
  }

  for (const [part,side] of [[parts.legL,-1],[parts.legR,1]]) {
    if (!part) continue;
    capsule(B,scene,`operator-v3-${id}-leg-${side<0?'l':'r'}`,part,body,{height:.54,radius:.095},id,friendly,disposables);
  }
  capsule(B,scene,`operator-v3-${id}-boot-l`,root,boot,{height:.31,radius:.115,rx:Math.PI/2,x:-.14,y:.07,z:-.06,sz:1.18},id,friendly,disposables);
  capsule(B,scene,`operator-v3-${id}-boot-r`,root,boot,{height:.31,radius:.115,rx:Math.PI/2,x:.14,y:.07,z:-.06,sz:1.18},id,friendly,disposables);

  torus(B,scene,`operator-v3-${id}-scarf`,root,accent,{diameter:.34,thickness:.035,tessellation:22,y:1.105,rx:Math.PI/2},id,friendly,disposables);
  sphere(B,scene,`operator-v3-${id}-nose`,root,skin,{diameter:.065,y:1.25,z:-.20,sx:.70,sy:.82,sz:1.05},id,friendly,disposables);

  if (profile.identity === 'scout-operator-v3') {
    capsule(B,scene,`operator-v3-${id}-goggles`,root,accent,{height:.29,radius:.040,rz:Math.PI/2,y:1.285,z:-.205,sz:.72},id,friendly,disposables);
  } else {
    cylinder(B,scene,`operator-v3-${id}-radio`,root,accent,{height:.25,diameter:.018,tessellation:8,x:.19,y:1.47,z:.06,rz:-.10},id,friendly,disposables);
  }
  root.metadata.visualIdentity = profile.identity;
}

function installCameraReveal(B, scene, restorers) {
  const camera = scene.getCameraByName?.('chesscom-camera') || scene.activeCamera;
  if (!camera || typeof camera.beta !== 'number') return;
  const oldBeta = camera.beta;
  const oldTarget = camera.target?.clone?.() || null;
  camera.beta = CHESSCOM_OPERATOR_V3.cameraBeta;
  if (camera.target) {
    camera.target.y = CHESSCOM_OPERATOR_V3.cameraTargetY;
    camera.target.z = CHESSCOM_OPERATOR_V3.cameraTargetZ;
  }
  restorers.push(() => {
    camera.beta = oldBeta;
    if (oldTarget && camera.target?.copyFrom) camera.target.copyFrom(oldTarget);
  });
}

export function installChesscomOperatorV3(B, scene) {
  const disposables = [];
  const restorers = [];
  const upgraded = new Set();
  const invisible = makeInvisibleMaterial(B,scene,disposables);
  installCameraReveal(B,scene,restorers);

  function ensure(id) {
    const root = scene.getTransformNodeByName?.(`unit-${id}`)
      || scene.transformNodes?.find?.((candidate) => candidate.name === `unit-${id}`);
    if (!root || upgraded.has(root)) return;
    const friendly = rootFriendly(root);
    const profile = chesscomOperatorV3Profile(id,friendly);
    if (id === 'matthias') addMatthiasV3(B,scene,root,disposables,restorers,invisible);
    else addMercenaryV3(B,scene,root,id,friendly,profile,disposables,restorers,invisible);
    upgraded.add(root);
  }

  return {
    update(state) {
      const units = [
        ...(Array.isArray(state?.friendlies) ? state.friendlies : []),
        ...(Array.isArray(state?.enemies) ? state.enemies : []),
      ];
      units.forEach((unit) => ensure(unit.id));
    },
    destroy() {
      for (const restore of restorers.reverse()) {
        try { restore(); } catch {}
      }
      for (const item of disposables.reverse()) {
        try { item?.dispose?.(); } catch {}
      }
      upgraded.clear();
    },
  };
}
