export const CHESSCOM_CHARACTER_ART_V4 = Object.freeze({
  identity:'character-art-v4',
  renderer:'custom-lowpoly-meshes',
  materials:'procedural-pbr',
  weaponSocket:'weapon-muzzle-v2',
});

// At tactical zoom, almost-black PBR clothing merged into the shadows.
export const CHESSCOM_OPERATOR_READABILITY_V22 = Object.freeze({
  identity:'operator-readability-v22',
  accentEmission:.085,
  faceEmission:.022,
});

export function chesscomCharacterV4Profile(id, friendly = true) {
  const key = String(id || '').toLowerCase();
  if (key === 'matthias') return Object.freeze({
    id:'matthias', role:'leader', friendly:true,
    identity:'matthias-operative-v4',
    cloth:'#252a2e', cloth2:'#323b40', armour:'#303840', accent:'#c8a165', skin:'#d4c5a1', compact:false,
    muzzleX:1.065,
  });
  if (!friendly) return Object.freeze({
    id:key || 'hostile', role:'hostile', friendly:false,
    identity:'hostile-operator-v4',
    cloth:'#423a34', cloth2:'#52453e', armour:'#292d2e', accent:'#b46d54', skin:'#a98b72', compact:false,
    muzzleX:.91,
  });
  if (key === 'sven') return Object.freeze({
    id:'sven', role:'scout', friendly:true,
    identity:'scout-operator-v4',
    cloth:'#36535c', cloth2:'#4a636a', armour:'#2c3f44', accent:'#70a5b0', skin:'#c09a79', compact:true,
    muzzleX:.82,
  });
  return Object.freeze({
    id:key || 'dieter', role:'rifleman', friendly:true,
    identity:'rifleman-operator-v4',
    cloth:'#51534c', cloth2:'#66685d', armour:'#343b37', accent:'#b39d75', skin:'#c6a280', compact:false,
    muzzleX:.91,
  });
}

// Extra silhouettes are deliberately attached to existing units. Their
// pick metadata stays identical to the unit, without changing tactical rules.
export function chesscomFieldKitV20Profile(role) {
  const key=String(role||'').toLowerCase();
  if(key==='scout')return Object.freeze({identity:'field-kit-v20',role:'scout',pack:.23,plates:.10,accent:'#4f8793',scarf:true});
  if(key==='rifleman')return Object.freeze({identity:'field-kit-v20',role:'rifleman',pack:.36,plates:.15,accent:'#8f7953',scarf:false});
  if(key==='hostile')return Object.freeze({identity:'field-kit-v20',role:'hostile',pack:.29,plates:.16,accent:'#8e4938',scarf:false});
  return Object.freeze({identity:'field-kit-v20',role:'leader',pack:.28,plates:.12,accent:'#b8873d',scarf:false});
}

// Less toy-like proportions at the ACTUAL tactical camera scale.
// Human operators have a narrower helmet, tapered shoulders, smaller hands
// and boots. Matthias retains the distinct ivory pawn head and peaked cap.
export const CHESSCOM_OPERATOR_ANATOMY_V28=Object.freeze({
  identity:'operator-anatomy-v28',
  helmetWidth:.355,
  helmetHeight:.160,
  headWidth:.158,
  bootDepth:.245,
  emphasis:'human-tapered-lowpoly',
});

// Battlefield-scale role recognition: broad cloth/metal shapes catch the
// moonlight at normal zoom, unlike tiny floating nameplates or emissive halos.
// This is decoration attached to the same unit root, never a new tactical actor.
export const CHESSCOM_OPERATOR_SILHOUETTE_V23 = Object.freeze({
  identity:'operator-silhouette-v23',
  maxPartsPerUnit:5,
  materials:'existing-character-pbr',
});

export function chesscomOperatorSilhouetteV23Parts(role='rifleman') {
  const kind=['leader','rifleman','scout','hostile'].includes(role)?role:'rifleman';
  const leader=kind==='leader';
  const scout=kind==='scout';
  const hostile=kind==='hostile';
  const size=leader?.19:scout?.16:hostile?.22:.21;
  const parts=[];
  for(const side of [-1,1]){
    parts.push({
      name:`shoulder-sign-${side}`,material:'accent',
      spec:{h:.067,bw:size,bd:.24,tw:size*.91,td:.21,
        x:side*(leader?.32:.30),y:leader?1.40:1.255,z:-.04},
    });
  }
  if(leader){
    // Brass tabs above the field coat. Do not obscure Matthias' ivory pawn,
    // distinctive canonical face, peaked cap or actual weapon socket.
    parts.push({name:'officer-coat-flash',material:'accent',
      spec:{h:.09,bw:.19,bd:.035,tw:.16,td:.028,x:0,y:1.15,z:-.204}});
  }else{
    parts.push({name:'upper-vest-id',material:'accent',
      spec:{h:.075,bw:scout?.19:.26,bd:.037,tw:scout?.18:.24,td:.033,
        x:0,y:1.075,z:-.265}});
    parts.push({name:'helmet-ridge',material:'accent',
      spec:{h:.036,bw:scout?.17:.20,bd:.28,tw:scout?.16:.19,td:.26,
        x:0,y:1.52,z:-.015}});
    parts.push({name:'pack-flash',material:hostile?'accent':'cloth2',
      spec:{h:.12,bw:scout?.24:.28,bd:.038,tw:scout?.22:.26,td:.035,
        x:0,y:.965,z:.375}});
  }
  return parts;
}

function addSilhouetteV23(B,scene,root,profile,mats,disposables){
  for(const part of chesscomOperatorSilhouetteV23Parts(profile.role)){
    polyBlock(B,scene,`silhouette-v23-${profile.id}-${part.name}`,
      root,mats[part.material],part.spec,profile.id,profile.friendly,disposables);
  }
  root.metadata.silhouetteArt=CHESSCOM_OPERATOR_SILHOUETTE_V23.identity;
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

function pbr(B, scene, name, hex, kind, disposables, { metallic=0, roughness=.72, emissive=0 } = {}) {
  if (B.PBRMaterial) {
    const mat = new B.PBRMaterial(name,scene);
    mat.albedoColor = B.Color3.FromHexString(hex);
    mat.metallic = metallic;
    mat.roughness = roughness;
    mat.environmentIntensity = .72;
    if(emissive>0) mat.emissiveColor=B.Color3.FromHexString(hex).scale(emissive);
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
  if(emissive>0) mat.emissiveColor=B.Color3.FromHexString(hex).scale(emissive);
  mat.diffuseTexture = makeSurfaceTexture(B,scene,`${name}-surface`,kind,96,disposables);
  disposables.push(mat);
  return mat;
}


/**
 * Eight-sided beveled cloth/armour cross-section, three rings.
 * Replaces box geometry inside an existing Babylon mesh: NO new draw calls,
 * parent transforms, unit IDs, input volumes or weapon/muzzle changes.
 */
export const CHESSCOM_OPERATOR_CONTOUR_V29=Object.freeze({
  identity:'operator-contour-v29', perimeter:8, rings:3, maxVertices:24,
  emphasis:'beveled-tailored-volume',
});

export function chesscomOperatorContourV29Geometry({h,bw,bd,tw,td,middleScale=1.04}){
  if(![h,bw,bd,tw,td,middleScale].every(Number.isFinite)
    ||Math.min(h,bw,bd,tw,td)<=0||middleScale<1||middleScale>1.12){
    throw new RangeError('Invalid operator contour dimensions');
  }
  // Clockwise perimeter at negative Z: the same broad front/back surfaces as
  // the old prism, but with chamfered shoulders, sleeves and boots.
  const perimeter=[
    [-.36,-.5],[.36,-.5],[.5,-.36],[.5,.36],
    [.36,.5],[-.36,.5],[-.5,.36],[-.5,-.36],
  ];
  const rings=[
    {y:-h/2,w:bw,d:bd},
    {y:0,w:(bw+tw)*.5*middleScale,d:(bd+td)*.5*middleScale},
    {y:h/2,w:tw,d:td},
  ];
  const positions=[],uvs=[],indices=[];
  for(let r=0;r<rings.length;r+=1){
    for(let i=0;i<perimeter.length;i+=1){
      const [px,pz]=perimeter[i],ring=rings[r];
      positions.push(px*ring.w,ring.y,pz*ring.d);
      uvs.push(i/perimeter.length,r/(rings.length-1));
    }
  }
  for(let i=1;i<7;i+=1){
    indices.push(0,i,i+1);
    indices.push(16,16+i+1,16+i);
  }
  for(let r=0;r<2;r+=1)for(let i=0;i<8;i+=1){
    const a=r*8+i,b=r*8+(i+1)%8,c=(r+1)*8+(i+1)%8,d=(r+1)*8+i;
    indices.push(a,c,b,a,d,c);
  }
  return {positions,indices,uvs};
}


/**
 * A bent, continuous upper-arm/forearm sleeve from shoulder to rifle grip.
 * This is one existing cloth mesh per arm, not separate cylinders or an IK rig.
 * Local root-space geometry follows the original weapon socket but does not
 * change the socket, hitboxes, ballistic origin, or tactical unit transforms.
 */
export const CHESSCOM_OPERATOR_POSE_V30=Object.freeze({
  identity:'operator-rifle-ready-pose-v30',rings:3,perimeter:8,
  newMeshesPerUnit:0,roles:Object.freeze(['rifleman','scout','hostile']),
});

export function chesscomOperatorArmPoseV30Geometry(side,role='rifleman'){
  if(side!==-1&&side!==1)throw new RangeError('Operator arm side must be -1 or 1');
  const compact=role==='scout';
  const anchors={
    wrist:{x:side<0?(compact?.075:.095):(compact?.47:.53),y:.895,z:-.36},
    elbow:{x:side*(compact?.30:.315),y:1.005,z:-.25},
    shoulder:{x:side*(compact?.275:.285),y:1.165,z:-.055},
  };
  const geometry=chesscomOperatorContourV29Geometry({
    h:.27,bw:compact?.105:.115,bd:compact?.115:.125,
    tw:compact?.135:.15,td:compact?.145:.16,middleScale:1.035,
  });
  for(const [ring,point] of [anchors.wrist,anchors.elbow,anchors.shoulder].entries()){
    for(let vertex=ring*8;vertex<ring*8+8;vertex+=1){
      geometry.positions[vertex*3]+=point.x;
      geometry.positions[vertex*3+1]=point.y;
      geometry.positions[vertex*3+2]+=point.z;
    }
  }
  return {...geometry,anchors};
}

function polyBlock(B, scene, name, parent, mat, spec, id, friendly, disposables) {
  const h = spec.h;
  const bw = spec.bw ?? spec.w;
  const bd = spec.bd ?? spec.d;
  const tw = spec.tw ?? spec.w;
  const td = spec.td ?? spec.d;
  const y0=-h/2, y1=h/2;
  const contour=spec.poseMesh || (spec.contour ? chesscomOperatorContourV29Geometry({h,bw,bd,tw,td}) : null);
  const positions=contour?.positions ?? [
    -bw/2,y0,-bd/2,  bw/2,y0,-bd/2,  bw/2,y0,bd/2,  -bw/2,y0,bd/2,
    -tw/2,y1,-td/2,  tw/2,y1,-td/2,  tw/2,y1,td/2,  -tw/2,y1,td/2,
  ];
  const indices=contour?.indices ?? [
    0,2,1,0,3,2, 4,5,6,4,6,7,
    0,1,5,0,5,4, 1,2,6,1,6,5,
    2,3,7,2,7,6, 3,0,4,3,4,7,
  ];
  const normals=[];
  B.VertexData.ComputeNormals(positions,indices,normals);
  const uv=contour?.uvs ?? [0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1];
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
    armour:pbr(B,scene,`character-v4-${profile.id}-armour`,profile.armour,'metal',disposables,{metallic:.36,roughness:.50}),
    accent:pbr(B,scene,`character-v4-${profile.id}-accent`,profile.accent,'metal',disposables,{metallic:.43,roughness:.43,emissive:CHESSCOM_OPERATOR_READABILITY_V22.accentEmission}),
    skin:pbr(B,scene,`character-v4-${profile.id}-skin`,profile.skin,'leather',disposables,{roughness:.70,emissive:CHESSCOM_OPERATOR_READABILITY_V22.faceEmission}),
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

function addFieldKitV20(B,scene,root,profile,mats,disposables){
  const kit=chesscomFieldKitV20Profile(profile.role);
  const id=profile.id;
  const part=(name,mat,spec)=>polyBlock(B,scene,`field-kit-v20-${id}-${name}`,root,mat,spec,id,profile.friendly,disposables);
  // Front armour silhouette: shoulder pads, load-bearing straps, and a
  // prominent radio/identity tab visible at ordinary tactical zoom.
  for(const side of [-1,1]){
    part(`pauldron-${side}`,mats.armour,{h:.15,bw:kit.plates+.09,bd:.23,tw:kit.plates+.035,td:.20,x:side*.29,y:1.18,z:-.02,rz:side*.15});
    part(`webbing-${side}`,mats.accent,{h:.35,bw:.052,bd:.034,tw:.042,td:.03,x:side*.12,y:.92,z:-.257,rz:side*.31});
    part(`pouch-${side}`,mats.cloth2,{h:.18,bw:.17,bd:.095,tw:.16,td:.09,x:side*.17,y:.67,z:-.21});
    part(`knee-${side}`,mats.armour,{h:.13,bw:.14,bd:.075,tw:.125,td:.06,x:side*.14,y:.30,z:-.09});
  }
  part('backpack',mats.cloth2,{h:kit.pack+.11,bw:profile.compact?.29:.36,bd:.16,tw:profile.compact?.27:.32,td:.14,y:.91,z:.28});
  part('unit-tab',mats.accent,{h:.11,bw:.16,bd:.045,tw:.15,td:.041,x:.15,y:1.02,z:-.282});
  if(kit.scarf)part('scout-collar',mats.accent,{h:.10,bw:.32,bd:.25,tw:.29,td:.23,y:1.16,z:-.018});
  if(profile.role==='hostile')part('hostile-visor',mats.accent,{h:.07,bw:.29,bd:.06,tw:.27,td:.05,y:1.30,z:-.176});
  root.metadata.fieldKit=kit.identity;
}

function addMercenary(B,scene,root,profile,disposables,restorers,invisible){
  hideLegacyMercenary(scene,profile.id,root,invisible,restorers);
  const mats=materialsFor(B,scene,profile,disposables);const parts=root.metadata?.parts||{};
  polyBlock(B,scene,`character-v4-${profile.id}-torso`,root,mats.cloth,{h:profile.compact?.66:.69,bw:profile.compact?.31:.35,bd:.27,tw:profile.compact?.40:.47,td:.29,y:.84,contour:true},profile.id,profile.friendly,disposables);
  polyBlock(B,scene,`character-v4-${profile.id}-vest`,root,mats.armour,{h:.43,bw:profile.compact?.31:.35,bd:.075,tw:profile.compact?.37:.42,td:.067,y:.90,z:-.178,contour:true},profile.id,profile.friendly,disposables);
  polyBlock(B,scene,`character-v4-${profile.id}-pelvis`,root,mats.cloth2,{h:.24,bw:.35,bd:.265,tw:.32,td:.25,y:.53,contour:true},profile.id,profile.friendly,disposables);
  polyHead(B,scene,`character-v4-${profile.id}-head`,root,mats.skin,{rx:CHESSCOM_OPERATOR_ANATOMY_V28.headWidth,ry:.178,rz:.148,y:1.275,z:-.01},profile.id,profile.friendly,disposables);
  polyBlock(B,scene,`character-v4-${profile.id}-helmet`,root,mats.armour,{h:CHESSCOM_OPERATOR_ANATOMY_V28.helmetHeight,bw:CHESSCOM_OPERATOR_ANATOMY_V28.helmetWidth,bd:.345,tw:.295,td:.29,y:1.41,z:.01,contour:true},profile.id,profile.friendly,disposables);
  for(const [part,side] of [[parts.armL,-1],[parts.armR,1]]){
    if(!part)continue;
    const arm=chesscomOperatorArmPoseV30Geometry(side,profile.role);
    // Both meshes now live on the unit root with the rifle, not on invisible
    // legacy block arms that introduced an extra rotation/offset.
    polyBlock(B,scene,`character-v4-${profile.id}-arm-${side<0?'l':'r'}`,root,mats.cloth,{h:.27,w:.15,d:.15,poseMesh:arm},profile.id,profile.friendly,disposables);
    polyBlock(B,scene,`character-v4-${profile.id}-glove-${side<0?'l':'r'}`,root,mats.boot,{
      h:.105,bw:.115,bd:.13,tw:.095,td:.11,
      x:arm.anchors.wrist.x,y:arm.anchors.wrist.y,z:arm.anchors.wrist.z,
      contour:true,
    },profile.id,profile.friendly,disposables);
  }
  for(const [part,side] of [[parts.legL,-1],[parts.legR,1]]){
    if(!part)continue;
    polyBlock(B,scene,`character-v4-${profile.id}-leg-${side<0?'l':'r'}`,part,mats.cloth2,{h:.50,bw:.100,bd:.125,tw:.137,td:.15,y:0,contour:true},profile.id,profile.friendly,disposables);
  }
  polyBlock(B,scene,`character-v4-${profile.id}-boot-l`,root,mats.boot,{h:.14,bw:.165,bd:CHESSCOM_OPERATOR_ANATOMY_V28.bootDepth,tw:.145,td:.22,x:-.135,y:.07,z:-.05,contour:true},profile.id,profile.friendly,disposables);
  polyBlock(B,scene,`character-v4-${profile.id}-boot-r`,root,mats.boot,{h:.14,bw:.165,bd:CHESSCOM_OPERATOR_ANATOMY_V28.bootDepth,tw:.145,td:.22,x:.135,y:.07,z:-.05,contour:true},profile.id,profile.friendly,disposables);
  if(profile.role==='scout'){
    polyBlock(B,scene,`character-v4-${profile.id}-goggles`,root,mats.accent,{h:.055,bw:.30,bd:.045,tw:.29,td:.04,y:1.29,z:-.165},profile.id,profile.friendly,disposables);
  }else{
    polyBlock(B,scene,`character-v4-${profile.id}-radio`,root,mats.accent,{h:.24,bw:.035,bd:.035,tw:.022,td:.022,x:.20,y:1.48,z:.03,rz:-.10},profile.id,profile.friendly,disposables);
  }
  addFieldKitV20(B,scene,root,profile,mats,disposables);
  addSilhouetteV23(B,scene,root,profile,mats,disposables);
  addWeapon(B,scene,root,profile,mats,disposables);
  root.metadata.humanArmPose=CHESSCOM_OPERATOR_POSE_V30.identity;
  root.metadata.visualIdentity=profile.identity;
  root.metadata.characterArt='v4';
}

function addMatthias(B,scene,root,profile,disposables,restorers,invisible){
  hideLegacyMatthias(scene,root,invisible,restorers);
  const mats=materialsFor(B,scene,profile,disposables);const parts=root.metadata?.parts||{};
  // Preserve Matthias' canonical face/head/cap, but replace the exosuit body with a tailored field coat.
  polyBlock(B,scene,'character-v4-matthias-coat',root,mats.cloth,{h:.72,bw:.45,bd:.30,tw:.54,td:.32,y:1.03,contour:true},profile.id,true,disposables);
  polyBlock(B,scene,'character-v4-matthias-lapel-l',root,mats.accent,{h:.36,bw:.055,bd:.035,tw:.035,td:.025,x:-.11,y:1.18,z:-.19,rz:-.22},profile.id,true,disposables);
  polyBlock(B,scene,'character-v4-matthias-lapel-r',root,mats.accent,{h:.36,bw:.055,bd:.035,tw:.035,td:.025,x:.11,y:1.18,z:-.19,rz:.22},profile.id,true,disposables);
  polyBlock(B,scene,'character-v4-matthias-belt',root,mats.accent,{h:.075,bw:.56,bd:.34,tw:.56,td:.34,y:.83},profile.id,true,disposables);
  for(const [part,side] of [[parts.armL,-1],[parts.armR,1]]){
    if(!part)continue;
    polyBlock(B,scene,`character-v4-matthias-sleeve-${side<0?'l':'r'}`,part,mats.cloth2,{h:.50,bw:.13,bd:.145,tw:.155,td:.165,y:-.27,contour:true},profile.id,true,disposables);
    polyBlock(B,scene,`character-v4-matthias-glove-${side<0?'l':'r'}`,part,mats.boot,{h:.16,bw:.16,bd:.18,tw:.14,td:.16,y:-.60,z:-.14},profile.id,true,disposables);
  }
  for(const [part,side] of [[parts.legL,-1],[parts.legR,1]]){
    if(!part)continue;
    polyBlock(B,scene,`character-v4-matthias-trouser-${side<0?'l':'r'}`,part,mats.cloth2,{h:.62,bw:.13,bd:.15,tw:.165,td:.17,y:-.35,contour:true},profile.id,true,disposables);
    polyBlock(B,scene,`character-v4-matthias-boot-${side<0?'l':'r'}`,part,mats.boot,{h:.18,bw:.205,bd:.33,tw:.18,td:.29,y:-.76,z:-.08,contour:true},profile.id,true,disposables);
  }
  // Matthias retains his canonical cap and pawn silhouette; epaulettes
  // and field-coat seams give him a unique officer profile at playing zoom.
  for(const side of [-1,1]){
    polyBlock(B,scene,`field-kit-v20-matthias-shoulder-${side}`,root,mats.accent,{h:.055,bw:.155,bd:.23,tw:.145,td:.21,x:side*.32,y:1.37,z:-.035},profile.id,true,disposables);
    polyBlock(B,scene,`field-kit-v20-matthias-cuff-${side}`,root,mats.accent,{h:.07,bw:.10,bd:.14,tw:.10,td:.14,x:side*.42,y:.83,z:-.10},profile.id,true,disposables);
  }
  polyBlock(B,scene,'field-kit-v20-matthias-chest-insignia',root,mats.accent,{h:.10,bw:.12,bd:.04,tw:.11,td:.04,x:.16,y:1.22,z:-.18},profile.id,true,disposables);
  root.metadata.fieldKit='field-kit-v20';
  addSilhouetteV23(B,scene,root,profile,mats,disposables);
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
