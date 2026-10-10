// Dust Veil industrial architecture. Builds only atop EXISTING Babylon buildings;
// none of the new pieces participates in tile picking, cover or line of sight.
export const CHESSCOM_INDUSTRIAL_ARCHITECTURE_V19 = Object.freeze({
  identity:'industrial-architecture-v19',
  buildingNames:Object.freeze(['OFFICE','STORAGE','NO FLAGS','JUST JOBS']),
  maxPartsPerBuilding:42,
});

export function chesscomIndustrialArchitectureParts({x,z,w,d,h},tier='ultra') {
  if (![x,z,w,d,h].every(Number.isFinite) || w<=1 || d<=1 || h<=1) return [];
  const full=tier==='ultra', detail=tier!=='balanced';
  const result=[];
  const add=(name,finish,px,py,pz,sx,sy,sz)=>{
    if (![px,py,pz,sx,sy,sz].every(Number.isFinite) || Math.min(sx,sy,sz)<=0) return;
    result.push({name,finish,x:px,y:py,z:pz,w:sx,h:sy,d:sz});
  };
  const front=z-d/2-.085, rear=z+d/2+.085;
  const left=x-w/2+.16, right=x+w/2-.16, roof=h+.18;

  // Vertical concrete-to-steel cladding gives the facade depth without
  // introducing fake obstacles or visual silhouettes in walkable cells.
  for(const side of [left,right]) {
    add('facade-pier','steel',side,h*.53,front,.14,h*.86,.14);
    add('pier-base','zinc',side,.22,front,.20,.32,.19);
  }
  add('facade-lintel','zinc',x,h-.34,front,w-.35,.115,.18);
  add('roof-flashing-front','steel',x,roof,front,w+.08,.14,.18);
  add('roof-flashing-rear','steel',x,roof,rear,w+.08,.14,.18);
  // Existing OFFICE/STORAGE lettering remains the primary facade signage.
  add('service-canopy','zinc',x-w*.27,1.80,front-.20,Math.min(1.23,w*.4),.10,.52);
  add('service-canopy-strut','rust',x-w*.27-.39,1.58,front-.42,.055,.44,.06);

  // Rooftop plant: silhouette, louvres and conduits catch moon/amber light.
  const plantX=x+w*.17,plantZ=z+d*.09;
  add('rooftop-air-handler','zinc',plantX,roof+.22,plantZ,Math.min(.89,w*.29),.40,Math.min(.76,d*.46));
  add('handler-cap','steel',plantX,roof+.46,plantZ,Math.min(.98,w*.31),.08,Math.min(.83,d*.48));
  if(detail) {
    const ventZ=plantZ-Math.min(.76,d*.46)*.51-.025;
    for(const offset of [-.12,0,.12])
      add('handler-louvre','steel',plantX,roof+.24+offset,ventZ,.52,.027,.032);
    add('vertical-exhaust','rust',x-w*.27,roof+.31,z+d*.17,.22,.58,.22);
    add('exhaust-cowl','steel',x-w*.27,roof+.64,z+d*.17,.36,.085,.36);
    add('roof-pipe','steel',x+w*.33,roof+.08,z-.02,.07,.13,Math.min(d*.72,1.55));
    add('roof-pipe-cross','rust',x+w*.33,roof+.18,z-d*.32,.22,.07,.08);
  }

  // Rails are rooftop-only and cannot masquerade as ground cover.
  if(detail) {
    add('roof-rear-rail','zinc',x,roof+.62,rear,w-.32,.056,.056);
    add('roof-rear-midrail','steel',x,roof+.36,rear,w-.32,.04,.04);
    for(const side of [left,right]) {
      add('roof-post','steel',side,roof+.36,rear,.058,.72,.058);
      add('roof-side-rail','zinc',side,roof+.61,z+d*.26,.055,.055,d*.47);
    }
    if(full) {
      for(const side of [x-w*.2,x+w*.2])
        add('roof-rear-post','steel',side,roof+.36,rear,.058,.72,.058);
      add('weathered-utility-panel','rust',x+w*.21,h*.64,front-.03,Math.min(.52,w*.20),.40,.035);
      add('utility-panel-lid','zinc',x+w*.21,h*.88,front-.06,Math.min(.58,w*.22),.07,.07);
      add('caution-trim','ochre',x-w*.27,1.81,front-.46,Math.min(1.23,w*.40),.025,.05);
    }
  }
  return result;
}

function standardMaterial(B,scene,name,hex) {
  const mat=new B.StandardMaterial(name,scene);
  mat.diffuseColor=B.Color3.FromHexString(hex);
  mat.specularColor=new B.Color3(.15,.18,.19);
  mat.specularPower=65;
  return mat;
}

export function installChesscomIndustrialArchitectureV19(B,scene,{tier='ultra',host=null}={}) {
  const dispose=[];
  // Shared primitives: instances reuse five vertex buffers instead of building
  // separate geometry for every fascia, roof rail and vent.
  const finishes={
    steel:'#25353b', zinc:'#576365', rust:'#79523a', ochre:'#ac8350',
  };
  const masters=new Map();
  let parts=0,buildings=0;
  try {
    for(const [finish,hex] of Object.entries(finishes)) {
      const material=standardMaterial(B,scene,`industrial-v19-${finish}`,hex);
      const master=B.MeshBuilder.CreateBox(`industrial-v19-template-${finish}`,{size:1},scene);
      master.material=material;
      master.position.set(0,-1000,0); // keep instance source outside every camera frustum
      master.isPickable=false;
      masters.set(finish,master);
      dispose.push(material,master);
    }
    for(const name of CHESSCOM_INDUSTRIAL_ARCHITECTURE_V19.buildingNames) {
      const wall=scene.getMeshByName?.(`building-${name}`);
      if(!wall)continue;
      wall.computeWorldMatrix?.(true);
      const box=wall.getBoundingInfo?.()?.boundingBox;
      if(!box)continue;
      const min=box.minimumWorld,max=box.maximumWorld;
      const spec={
        x:(min.x+max.x)/2, z:(min.z+max.z)/2,
        w:max.x-min.x,d:max.z-min.z,h:max.y,
      };
      const pieces=chesscomIndustrialArchitectureParts(spec,tier);
      if(!pieces.length)continue;
      buildings+=1;
      pieces.forEach((piece,index)=>{
        const mesh=masters.get(piece.finish)?.createInstance?.(`industrial-v19-${name.replaceAll(' ','-')}-${piece.name}-${index}`);
        if(!mesh)return;
        mesh.position.set(piece.x,piece.y,piece.z);
        mesh.scaling.set(piece.w,piece.h,piece.d);
        mesh.isPickable=false;
        mesh.receiveShadows=true;
        dispose.push(mesh);
        parts+=1;
      });
    }
    if(host)host.dataset.chesscomArchitecture=CHESSCOM_INDUSTRIAL_ARCHITECTURE_V19.identity;
    return {
      counts:{buildings,parts,templates:masters.size},
      destroy() {
        for(const item of dispose.reverse()) { try{item.dispose?.();}catch{} }
        if(host)delete host.dataset.chesscomArchitecture;
      },
    };
  }catch(error){
    for(const item of dispose.reverse()){try{item.dispose?.();}catch{}}
    if(host)delete host.dataset.chesscomArchitecture;
    throw error;
  }
}
