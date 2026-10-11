// Kharif Outpost · loading architecture. A facade/roof-only visual kit,
// derived from the four existing buildings: no tactical tiles, blockers, cover,
// paths, objectives or picking metadata are created by this layer.
export const CHESSCOM_KHARIF_LOADING_BAYS_V27=Object.freeze({
  identity:'kharif-loading-bays-v27',
  buildings:Object.freeze(['OFFICE','STORAGE','NO FLAGS','JUST JOBS']),
  maxPartsPerBuilding:34,
});

export function chesscomKharifLoadingBayParts({x,z,w,d,h},tier='ultra',name='OFFICE'){
  if(![x,z,w,d,h].every(Number.isFinite)||w<2||d<1.5||h<1.8)return[];
  const balanced=tier==='balanced',ultra=tier==='ultra';
  const items=[];
  const add=(part,finish,shape,px,py,pz,sx,sy,sz,rz=0)=>{
    if(![px,py,pz,sx,sy,sz,rz].every(Number.isFinite)||Math.min(sx,sy,sz)<=0)return;
    items.push({name:part,finish,shape,x:px,y:py,z:pz,w:sx,h:sy,d:sz,rz});
  };
  const front=z-d/2-.075;
  const left=name==='STORAGE'||name==='JUST JOBS';
  const dockX=x+(left?-.13:.13)*w;
  const doorW=Math.min(1.34,w*.39),doorH=Math.min(1.43,h*.62);
  const doorMid=.33+doorH/2;
  // Indented loading shutter: keep its apron wholly inside the existing
  // building footprint; no fake waist-high cover on walkable tiles.
  add('dock-recess','shadow','box',dockX,doorMid,front+.012,doorW,doorH,.04);
  add('apron','concrete','box',dockX,.12,front+.22,doorW+.50,.24,.34);
  for(const side of [-1,1]){
    add('door-jamb','steel','box',dockX+side*(doorW/2+.065),doorMid,front-.065,.11,doorH+.12,.12);
  }
  add('door-header','zinc','box',dockX,doorMid+doorH/2+.12,front-.08,doorW+.32,.17,.17);
  add('canopy','zinc','box',dockX,doorMid+doorH/2+.44,front-.26,doorW+.72,.13,.64);
  // A high roller shutter reads as an actual loading bay at tactical zoom.
  for(let n=0;n<4;n++)add('shutter-rib','steel','box',dockX,.41+n*(doorH-.22)/4,front-.018,doorW-.07,.038,.055);
  // Prominent vertical utility trunk and rooftop duct connect this loading
  // access to rooftop plant. Their footprint remains on the original wall.
  const utilX=x+(left?.37:-.37)*w;
  add('riser','rust','box',utilX,h*.49,front+.045,.12,h*.82,.12);
  add('roof-elbow','steel','box',utilX,h+.06,front+d*.22,.14,.13,d*.43);
  add('roof-catwalk','zinc','box',x,h+.27,z,Math.min(w*.66,2.55),.14,Math.min(d*.35,.72));
  if(!balanced){
    add('dock-step','steel','box',dockX,.055,front+.38,doorW+.38,.10,.18);
    for(const side of [-1,1])add('canopy-brace','rust','box',dockX+side*(doorW/2+.25),doorMid+doorH/2+.19,front-.33,.09,.40,.09,side*.24);
    for(const side of [-1,1])add('roof-walk-edge','steel','box',x+side*Math.min(w*.66,2.55)/2,h+.39,z,.055,.18,Math.min(d*.35,.72));
    // Conspicuous equipment has a different silhouette from simple boxes.
    const drumX=x+(left?.26:-.26)*w;
    add('roof-pressure-tank','zinc','cylinder',drumX,h+.53,z+d*.19,.46,.68,.46);
    add('tank-cap','rust','cylinder',drumX,h+.88,z+d*.19,.52,.07,.52);
    add('dock-number','ochre','box',dockX+(doorW/2+.23),doorMid+doorH*.32,front-.13,.23,.19,.035);
  }
  if(ultra){
    for(const side of [-1,1]){
      add('pressure-tank-foot','steel','box',x+(left?.26:-.26)*w+side*.16,h+.18,z+d*.19,.08,.24,.09);
    }
    add('rolling-door-handle','ochre','box',dockX,doorMid-doorH*.29,front-.065,.30,.045,.07);
    add('roof-access-bridge','steel','box',x,h+.42,z+d*.26,Math.min(w*.5,1.9),.095,.17);
    add('flashing','ochre','box',dockX,doorMid+doorH/2+.50,front-.61,doorW+.72,.035,.055);
  }
  return items;
}

function material(B,scene,name,hex){
  const mat=new B.StandardMaterial(name,scene);
  mat.diffuseColor=B.Color3.FromHexString(hex);
  mat.specularColor=new B.Color3(.10,.12,.13);
  mat.specularPower=48;
  return mat;
}

export function installChesscomKharifLoadingBaysV27(B,scene,{tier='ultra',host}={}){
  const dispose=[];
  const templates=new Map();
  const finishes={steel:'#304047',zinc:'#697371',rust:'#805940',ochre:'#b38d50',concrete:'#606969',shadow:'#253034'};
  let buildings=0,parts=0;
  const cleanup=()=>{
    for(const item of dispose.reverse())try{item.dispose?.();}catch{}
    if(host)delete host.dataset.chesscomLoadingBays;
  };
  try{
    for(const [finish,hex]of Object.entries(finishes)){
      const mat=material(B,scene,'kharif-v27-'+finish,hex);
      dispose.push(mat);
      // Only roof-pressure-tank finishes need a cylinder master.
      for(const shape of ((finish==='zinc'||finish==='rust')?['box','cylinder']:['box'])){
        const name=`kharif-v27-master-${finish}-${shape}`;
        const master=shape==='box'
          ?B.MeshBuilder.CreateBox(name,{size:1},scene)
          :B.MeshBuilder.CreateCylinder(name,{height:1,diameter:1,tessellation:12},scene);
        master.material=mat;
        master.position.set(0,-1000,0);
        master.isPickable=false;
        dispose.push(master);
        templates.set(finish+':'+shape,master);
      }
    }
    for(const name of CHESSCOM_KHARIF_LOADING_BAYS_V27.buildings){
      const wall=scene.getMeshByName?.('building-'+name);
      if(!wall)continue;
      wall.computeWorldMatrix?.(true);
      const bbox=wall.getBoundingInfo?.()?.boundingBox;
      if(!bbox)continue;
      const min=bbox.minimumWorld,max=bbox.maximumWorld;
      const components=chesscomKharifLoadingBayParts({
        x:(min.x+max.x)/2,z:(min.z+max.z)/2,
        w:max.x-min.x,d:max.z-min.z,h:max.y,
      },tier,name);
      if(!components.length)continue;
      buildings++;
      for(const [i,part]of components.entries()){
        const instance=templates.get(part.finish+':'+part.shape)?.createInstance?.(
          `kharif-v27-${name.replaceAll(' ','-')}-${part.name}-${i}`
        );
        if(!instance)continue;
        instance.position.set(part.x,part.y,part.z);
        instance.scaling.set(part.w,part.h,part.d);
        instance.rotation.z=part.rz;
        instance.isPickable=false;
        instance.receiveShadows=true;
        dispose.push(instance);
        parts++;
      }
    }
    if(host)host.dataset.chesscomLoadingBays=CHESSCOM_KHARIF_LOADING_BAYS_V27.identity;
    return {counts:{buildings,parts,templates:templates.size},destroy:cleanup};
  }catch(e){cleanup();throw e;}
}
