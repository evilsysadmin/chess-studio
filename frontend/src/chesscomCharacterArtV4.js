export const CHESSCOM_CHARACTER_ART_V4 = Object.freeze({
  identity:'character-art-v4',
  renderer:'custom-lowpoly-meshes',
  materials:'procedural-pbr',
  weaponSocket:'weapon-muzzle-v2',
});

export function chesscomCharacterV4Profile(id, friendly = true) {
  const key = String(id || '').toLowerCase();
  if (key === 'matthias') return Object.freeze({
    id:'matthias', role:'leader', friendly:true,
    identity:'matthias-operative-v4',
    cloth:'#171a1c', cloth2:'#24292c', armour:'#20262a', accent:'#b8873d', skin:'#d4c5a1', compact:false,
    muzzleX:1.065,
  });
  if (!friendly) return Object.freeze({
    id:key || 'hostile', role:'hostile', friendly:false,
    identity:'hostile-operator-v4',
    cloth:'#292725', cloth2:'#36312c', armour:'#171b1d', accent:'#8e4938', skin:'#a98b72', compact:false,
    muzzleX:.91,
  });
  if (key === 'sven') return Object.freeze({
    id:'sven', role:'scout', friendly:true,
    identity:'scout-operator-v4',
    cloth:'#233034', cloth2:'#304047', armour:'#1d282c', accent:'#4f8793', skin:'#c09a79', compact:true,
    muzzleX:.82,
  });
  return Object.freeze({
    id:key || 'dieter', role:'rifleman', friendly:true,
    identity:'rifleman-operator-v4',
    cloth:'#33342f', cloth2:'#45453d', armour:'#202625', accent:'#8f7953', skin:'#c6a280', compact:false,
    muzzleX:.91,
  });
}

function unitRoot(scene, id) {
  return scene.getTransformNodeByName?.(`unit-${id}`)
    || scene.transformNodes?.find?.((node) => node.name === `unit-${id}`)
    || null;
}

function unitFriendly(root) {
  const child = root?.getChildMeshes?.().find?.((mesh) => mesh?.metadata?.type === 'unit');
  return child?.metadata?.friendly !== false;
}

function tag(mesh, id, friendly) {
  if (!mesh) return mesh;
  mesh.metadata = { ...(mesh.metadata || {}), type:'unit', id, friendly, artPass:'v4' };
  mesh.isPickable = true;
  mesh.receiveShadows = true;
  return mesh;
}

function invisibleMaterial(B, scene, disposables) {
  const mat = new B.StandardMaterial('character-v4-invisible',scene);
  mat.alpha = 0;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  disposables.push(mat);
  return mat;
}

function hideMesh(mesh, invisible, restorers) {
  if (!mesh || mesh.material === invisible) return;
  const old = mesh.material;
  mesh.material = invisible;
  restorers.push(() => { if (!mesh.isDisposed?.()) mesh.material = old; });
}

function hideNamed(scene, names, invisible, restorers) {
  for (const name of names) hideMesh(scene.getMeshByName?.(name),invisible,restorers);
}

function makeSurfaceTexture(B, scene, name, kind, size, disposables) {
  const texture = new B.DynamicTexture(name,{width:size,height:size},scene,false);
  texture.wrapU = B.Texture.WRAP_ADDRESSMODE;
  texture.wrapV = B.Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 8;
  const ctx = texture.getContext();
  ctx.fillStyle = '#f4f4f1';
  ctx.fillRect(0,0,size,size);
  if (kind === 'cloth') {
    for (let p=2;p<size;p+=5) {
      ctx.strokeStyle='rgba(36,42,45,.13)';
      ctx.lineWidth=.7;
      ctx.beginPath();ctx.moveTo(0,p);ctx.lineTo(size,p);ctx.stroke();
      ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,size);ctx.stroke();
    }
    for (let p=-size;p<size*2;p+=17) {
      ctx.strokeStyle='rgba(255,255,255,.10)';
      ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p+size,size);ctx.stroke();
    }
  } else if (kind === 'metal') {
    for (let i=0;i<28;i+=1) {
      const x=(i*43)%size; const y=(i*29)%size; const len=5+(i%7)*3;
      ctx.strokeStyle=`rgba(40,40,40,${.045+(i%4)*.015})`;
      ctx.lineWidth=.6;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(Math.min(size,x+len),y+(i%2?.7:-.7));ctx.stroke();
    }
  } else if (kind === 'leather') {
    for (let i=0;i<24;i+=1) {
      const x=(i*31)%size; const y=(i*47)%size;
      ctx.fillStyle=`rgba(55,48,42,${.035+(i%3)*.018})`;
      ctx.beginPath();ctx.ellipse(x,y,2+(i%4),1+(i%3),0,0,Math.PI*2);ctx.fill();
    }
  }
  texture.update(false);
  disposables.push(texture);
  return texture;
}

function pbr(B, scene, name, hex, kind, disposables, { metallic=0, roughness=.72 } = {}) {
  if (B.PBRMaterial) {
    const mat = new B.PBRMaterial(name,scene);
    mat.albedoColor = B.Color3.FromHexString(hex);
    mat.metallic = metallic;
    mat.roughness = roughness;
    mat.environmentIntensity = .72;
    const texture = makeSurfaceTexture(B,scene,`${name}-surface`,kind,128,disposables);
    texture.uScale = texture.vScale = kind === 'cloth' ? 7 : kind === 'metal' ? 4.5 : 5.5;
    mat.albedoTexture = texture;
    disposables.push(mat);
    return mat;
  }
  const mat = new B.StandardMaterial(name,scene);
  mat.diffuseColor = B.Color3.FromHexString(hex);
  mat.specularColor = kind === 'metal' ? new B.Color3(.28,.29,.30) : new B.Color3(.045,.05,.052);
  mat.specularPower = kind === 'metal' ? 96 : 18;
  mat.diffuseTexture = makeSurfaceTexture(B,scene,`${name}-surface`,kind,96,disposables);
  disposables.push(mat);
  return mat;
}

function polyBlock(B, scene, name, parent, mat, spec, id, friendly, disposables) {
  const h = spec.h;
  const bw = spec.bw ?? spec.w;
  const bd = spec.bd ?? spec.d;
  const tw = spec.tw ?? spec.w;
  const td = spec.td ?? spec.d;
  const y0=-h/2, y1=h/2;
  const positions=[
    -bw/2,y0,-bd/2,  bw/2,y0,-bd/2,  bw/2,y0,bd/2,  -bw/2,y0,bd/2,
    -tw/2,y1,-td/2,  tw/2,y1,-td/2,  tw/2,y1,td/2,  -tw/2,y1,td/2,
  ];
  const indices=[
    0,2,1,0,3,2, 4,5,6,4,6,7,
    0,1,5,0,5,4, 1,2,6,1,6,5,
    2,3,7,2,7,6, 3,0,4,3,4,7,
  ];
  const normals=[];
  B.VertexData.ComputeNormals(positions,indices,normals);
  const uv=[0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1];
  const mesh=new B.Mesh(name,scene);
  const vd=new B.VertexData();
  vd.positions=positions;vd.indices=indices;vd.normals=normals;vd.uvs=uv;vd.applyToMesh(mesh);
  mesh.convertToFlatShadedMesh?.();
  mesh.parent=parent||null;
  mesh.position.set(spec.x||0,spec.y||0,spec.z||0);
  mesh.rotation.set(spec.rx||0,spec.ry||0,spec.rz||0);
  mesh.scaling.set(spec.sx??1,spec.sy??1,spec.sz??1);
  mesh.material=mat;
  tag(mesh,id,friendly);
  disposables.push(mesh);
  return mesh;
}

function polyHead(B,scene,name,parent,mat,spec,id,friendly,disposables) {
  const segments=10, rings=5;
  const positions=[],indices=[],uvs=[];
  for(let r=0;r<=rings;r+=1){
    const v=r/rings;
    const phi=-Math.PI/2+v*Math.PI;
    const ring=Math.cos(phi);
    const y=Math.sin(phi)*(spec.ry||.18);
    for(let s=0;s<segments;s+=1){
      const u=s/segments; const a=u*Math.PI*2;
      positions.push(Math.cos(a)*ring*(spec.rx||.18),y,Math.sin(a)*ring*(spec.rz||.16));
      uvs.push(u,v);
    }
  }
  for(let r=0;r<rings;r+=1)for(let s=0;s<segments;s+=1){
    const n=(s+1)%segments; const a=r*segments+s,b=r*segments+n,c=(r+1)*segments+s,d=(r+1)*segments+n;
    indices.push(a,c,b,b,c,d);
  }
  const normals=[];B.VertexData.ComputeNormals(positions,indices,normals);
  const mesh=new B.Mesh(name,scene);const vd=new B.VertexData();
  vd.positions=positions;vd.indices=indices;vd.normals=normals;vd.uvs=uvs;vd.applyToMesh(mesh);
  mesh.convertToFlatShadedMesh?.();
  mesh.parent=parent||null;mesh.position.set(spec.x||0,spec.y||0,spec.z||0);mesh.material=mat;
  tag(mesh,id,friendly);disposables.push(mesh);return mesh;
}

function materialsFor(B,scene,profile,disposables){
  return {
    cloth:pbr(B,scene,`character-v4-${profile.id}-cloth`,profile.cloth,'cloth',disposables,{roughness:.88}),
    cloth2:pbr(B,scene,`character-v4-${profile.id}-cloth2`,profile.cloth2,'cloth',disposables,{roughness:.82}),
    armour:pbr(B,scene,`character-v4-${profile.id}-armour`,profile.armour,'metal',disposables,{metallic:.36,roughness:.43}),
    accent:pbr(B,scene,`character-v4-${profile.id}-accent`,profile.accent,'metal',disposables,{metallic:.54,roughness:.34}),
    skin:pbr(B,scene,`character-v4-${profile.id}-skin`,profile.skin,'leather',disposables,{roughness:.70}),
    boot:pbr(B,scene,`character-v4-${profile.id}-boot`,'#101315','leather',disposables,{roughness:.78}),
    gun:pbr(B,scene,`character-v4-${profile.id}-gun`,'#111619','metal',disposables,{metallic:.62,roughness:.29}),
  };
}

function hideLegacyMercenary(scene,id,root,invisible,restorers){
  hideNamed(scene,[`${id}-pelvis`,`${id}-torso`,`${id}-plate`,`${id}-pack`,`${id}-head`,`${id}-helmet`,`${id}-helmet-band`,`${id}-arm-l`,`${id}-arm-r`,`${id}-glove-l`,`${id}-glove-r`,`${id}-belt`,`${id}-pouch-l`,`${id}-pouch-r`,`${id}-leg-l`,`${id}-leg-r`,`${id}-boot-l`,`${id}-boot-r`,`${id}-visor`],invisible,restorers);
  root?.metadata?.parts?.weapon?.getChildMeshes?.().forEach((mesh)=>hideMesh(mesh,invisible,restorers));
}

function hideLegacyMatthias(scene,root,invisible,restorers){
  hideNamed(scene,[
    'matthias-pelvis-frame','matthias-pawn-core','matthias-core-base','matthias-core-collar',
    'matthias-harness-top','matthias-chest-strap-l','matthias-chest-strap-r','matthias-shoulder-l','matthias-shoulder-r','matthias-shoulder-trim-l','matthias-shoulder-trim-r',
    'matthias-upper-arm-l','matthias-upper-arm-r','matthias-elbow-l','matthias-elbow-r','matthias-forearm-l','matthias-forearm-r','matthias-glove-l','matthias-glove-r',
    'matthias-thigh-l','matthias-thigh-r','matthias-knee-l','matthias-knee-r','matthias-shin-l','matthias-shin-r','matthias-boot-l','matthias-boot-r','matthias-boot-trim-l','matthias-boot-trim-r',
    'matthias-coat-l','matthias-coat-r','matthias-coat-trim-l','matthias-coat-trim-r','matthias-holster',
  ],invisible,restorers);
  root?.metadata?.parts?.weapon?.getChildMeshes?.().forEach((mesh)=>hideMesh(mesh,invisible,restorers));
}

function addWeapon(B,scene,root,profile,mats,disposables){
  const weapon=root.metadata?.parts?.weapon;
  if(!weapon)return;
  const compact=profile.role==='scout';
  const scale=profile.role==='leader'?.91:1;
  polyBlock(B,scene,`character-v4-${profile.id}-receiver`,weapon,mats.gun,{w:.46*scale,h:.105,d:.14,x:.22},profile.id,profile.friendly,disposables);
  polyBlock(B,scene,`character-v4-${profile.id}-stock`,weapon,mats.gun,{w:.25*scale,h:.12,d:.125,x:-.15,tw:.20,bw:.25},profile.id,profile.friendly,disposables);
  polyBlock(B,scene,`character-v4-${profile.id}-handguard`,weapon,mats.gun,{w:(compact?.30:.38)*scale,h:.09,d:.115,x:.60},profile.id,profile.friendly,disposables);
  polyBlock(B,scene,`character-v4-${profile.id}-barrel`,weapon,mats.gun,{w:.06,h:(compact?.29:.39)*scale,d:.06,x:profile.muzzleX-.18,rz:Math.PI/2},profile.id,profile.friendly,disposables);
  polyBlock(B,scene,`character-v4-${profile.id}-mag`,weapon,mats.gun,{w:.12,h:.25,d:.105,x:.20,y:-.16,rz:-.18,tw:.09,bw:.12},profile.id,profile.friendly,disposables);
  polyBlock(B,scene,`character-v4-${profile.id}-optic`,weapon,mats.armour,{w:.18,h:.075,d:.085,x:.25,y:.11,tw:.14,bw:.18},profile.id,profile.friendly,disposables);
  if(profile.role==='leader') polyBlock(B,scene,`character-v4-${profile.id}-suppressor`,weapon,mats.gun,{w:.055,h:.30,d:.055,x:.91,rz:Math.PI/2},profile.id,profile.friendly,disposables);
  root.metadata.weaponMuzzleLocalX=profile.muzzleX;
}

function addMercenary(B,scene,root,profile,disposables,restorers,invisible){
  hideLegacyMercenary(scene,profile.id,root,invisible,restorers);
  const mats=materialsFor(B,scene,profile,disposables);const parts=root.metadata?.parts||{};
  polyBlock(B,scene,`character-v4-${profile.id}-torso`,root,mats.cloth,{h:profile.compact?.62:.69,bw:profile.compact?.44:.50,bd:.31,tw:profile.compact?.39:.44,td:.28,y:.84},profile.id,profile.friendly,disposables);
  polyBlock(B,scene,`character-v4-${profile.id}-vest`,root,mats.armour,{h:.44,bw:profile.compact?.41:.46,bd:.10,tw:profile.compact?.37:.42,td:.085,y:.90,z:-.19},profile.id,profile.friendly,disposables);
  polyBlock(B,scene,`character-v4-${profile.id}-pelvis`,root,mats.cloth2,{h:.25,bw:.39,bd:.29,tw:.34,td:.27,y:.53},profile.id,profile.friendly,disposables);
  polyHead(B,scene,`character-v4-${profile.id}-head`,root,mats.skin,{rx:.17,ry:.19,rz:.16,y:1.27,z:-.01},profile.id,profile.friendly,disposables);
  polyBlock(B,scene,`character-v4-${profile.id}-helmet`,root,mats.armour,{h:.18,bw:.40,bd:.37,tw:.30,td:.31,y:1.40,z:.01},profile.id,profile.friendly,disposables);
  for(const [part,side] of [[parts.armL,-1],[parts.armR,1]]){
    if(!part)continue;
    polyBlock(B,scene,`character-v4-${profile.id}-arm-${side<0?'l':'r'}`,part,mats.cloth,{h:.48,bw:.13,bd:.15,tw:.115,td:.135,z:-.24,rx:Math.PI/2},profile.id,profile.friendly,disposables);
    polyBlock(B,scene,`character-v4-${profile.id}-glove-${side<0?'l':'r'}`,part,mats.boot,{h:.15,bw:.14,bd:.16,tw:.12,td:.14,z:-.50,rx:Math.PI/2},profile.id,profile.friendly,disposables);
  }
  for(const [part,side] of [[parts.legL,-1],[parts.legR,1]]){
    if(!part)continue;
    polyBlock(B,scene,`character-v4-${profile.id}-leg-${side<0?'l':'r'}`,part,mats.cloth2,{h:.50,bw:.145,bd:.16,tw:.125,td:.14,y:0},profile.id,profile.friendly,disposables);
  }
  polyBlock(B,scene,`character-v4-${profile.id}-boot-l`,root,mats.boot,{h:.14,bw:.18,bd:.31,tw:.17,td:.26,x:-.14,y:.07,z:-.05},profile.id,profile.friendly,disposables);
  polyBlock(B,scene,`character-v4-${profile.id}-boot-r`,root,mats.boot,{h:.14,bw:.18,bd:.31,tw:.17,td:.26,x:.14,y:.07,z:-.05},profile.id,profile.friendly,disposables);
  if(profile.role==='scout'){
    polyBlock(B,scene,`character-v4-${profile.id}-goggles`,root,mats.accent,{h:.055,bw:.30,bd:.045,tw:.29,td:.04,y:1.29,z:-.165},profile.id,profile.friendly,disposables);
  }else{
    polyBlock(B,scene,`character-v4-${profile.id}-radio`,root,mats.accent,{h:.24,bw:.035,bd:.035,tw:.022,td:.022,x:.20,y:1.48,z:.03,rz:-.10},profile.id,profile.friendly,disposables);
  }
  addWeapon(B,scene,root,profile,mats,disposables);
  root.metadata.visualIdentity=profile.identity;
  root.metadata.characterArt='v4';
}

function addMatthias(B,scene,root,profile,disposables,restorers,invisible){
  hideLegacyMatthias(scene,root,invisible,restorers);
  const mats=materialsFor(B,scene,profile,disposables);const parts=root.metadata?.parts||{};
  // Preserve Matthias' canonical face/head/cap, but replace the exosuit body with a tailored field coat.
  polyBlock(B,scene,'character-v4-matthias-coat',root,mats.cloth,{h:.70,bw:.58,bd:.33,tw:.46,td:.29,y:1.03},profile.id,true,disposables);
  polyBlock(B,scene,'character-v4-matthias-lapel-l',root,mats.accent,{h:.36,bw:.055,bd:.035,tw:.035,td:.025,x:-.11,y:1.18,z:-.19,rz:-.22},profile.id,true,disposables);
  polyBlock(B,scene,'character-v4-matthias-lapel-r',root,mats.accent,{h:.36,bw:.055,bd:.035,tw:.035,td:.025,x:.11,y:1.18,z:-.19,rz:.22},profile.id,true,disposables);
  polyBlock(B,scene,'character-v4-matthias-belt',root,mats.accent,{h:.075,bw:.56,bd:.34,tw:.56,td:.34,y:.83},profile.id,true,disposables);
  for(const [part,side] of [[parts.armL,-1],[parts.armR,1]]){
    if(!part)continue;
    polyBlock(B,scene,`character-v4-matthias-sleeve-${side<0?'l':'r'}`,part,mats.cloth2,{h:.50,bw:.15,bd:.16,tw:.13,td:.14,y:-.27},profile.id,true,disposables);
    polyBlock(B,scene,`character-v4-matthias-glove-${side<0?'l':'r'}`,part,mats.boot,{h:.16,bw:.16,bd:.18,tw:.14,td:.16,y:-.60,z:-.14},profile.id,true,disposables);
  }
  for(const [part,side] of [[parts.legL,-1],[parts.legR,1]]){
    if(!part)continue;
    polyBlock(B,scene,`character-v4-matthias-trouser-${side<0?'l':'r'}`,part,mats.cloth2,{h:.62,bw:.16,bd:.17,tw:.135,td:.15,y:-.35},profile.id,true,disposables);
    polyBlock(B,scene,`character-v4-matthias-boot-${side<0?'l':'r'}`,part,mats.boot,{h:.18,bw:.22,bd:.37,tw:.20,td:.31,y:-.76,z:-.08},profile.id,true,disposables);
  }
  addWeapon(B,scene,root,profile,mats,disposables);
  root.metadata.visualIdentity=profile.identity;
  root.metadata.characterArt='v4';
}

export function installChesscomCharacterArtV4(B,scene){
  const disposables=[];const restorers=[];const upgraded=new Set();const invisible=invisibleMaterial(B,scene,disposables);
  function ensure(id){
    const root=unitRoot(scene,id);if(!root||upgraded.has(root))return;
    const friendly=unitFriendly(root);const profile=chesscomCharacterV4Profile(id,friendly);
    if(profile.id==='matthias')addMatthias(B,scene,root,profile,disposables,restorers,invisible);
    else addMercenary(B,scene,root,profile,disposables,restorers,invisible);
    upgraded.add(root);
  }
  return {
    update(state){
      const units=[...(Array.isArray(state?.friendlies)?state.friendlies:[]),...(Array.isArray(state?.enemies)?state.enemies:[])];
      units.forEach((unit)=>ensure(unit.id));
    },
    destroy(){
      for(const restore of restorers.reverse()){try{restore();}catch{}}
      for(const item of disposables.reverse()){try{item?.dispose?.();}catch{}}
      upgraded.clear();
    },
  };
}
