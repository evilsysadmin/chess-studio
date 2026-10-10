// Dust Veil · Kharif Outpost industrial compound composition.
//
// Decorates the *existing* building envelopes and links their rooftop services.
// Zero cover/blocker/tile/input changes. Every mesh is non-pickable, all geometry
// is static and instances only four material/vertex-buffer masters.
export const CHESSCOM_INDUSTRIAL_COMPOUND_V27=Object.freeze({
  identity:'industrial-compound-v27',
  buildingNames:Object.freeze(['OFFICE','STORAGE','NO FLAGS','JUST JOBS']),
  maxParts:55,
  minPipeClearance:3.10,
});

const FINISHES=Object.freeze({
  shutter:'#655446',
  gunmetal:'#303b40',
  zinc:'#687477',
  caution:'#b49655',
});

export function chesscomIndustrialCompoundParts(buildings=[],tier='ultra'){
  const high=tier!=='balanced',ultra=tier==='ultra';
  const pieces=[];
  const push=(name,finish,x,y,z,w,h,d)=>{
    const values=[x,y,z,w,h,d];
    if(!values.every(Number.isFinite)||Math.min(w,h,d)<=0)return;
    pieces.push({name,finish,x,y,z,w,h,d});
  };
  const valid=(buildings||[]).filter(b=>b
    &&CHESSCOM_INDUSTRIAL_COMPOUND_V27.buildingNames.includes(b.name)
    &&[b.x,b.z,b.w,b.d,b.h].every(Number.isFinite)
    &&b.w>2&&b.d>1.7&&b.h>2);
  for(const b of valid){
    if(!high&&!['OFFICE','STORAGE'].includes(b.name))continue;
    const mainBay=b.name==='OFFICE'||b.name==='STORAGE';
    const tag=b.name.replaceAll(' ','-').toLowerCase();
    const face=b.x+b.w/2, center=b.z+.02*b.d;
    const x=face+.055, panelD=Math.min(1.28,b.d*.75);
    // On the unoccupied side wall, never on a walkable ground tile.
    push(`${tag}-loading-shutter`,'shutter',x,.88,center,.075,1.52,panelD);
    for(const z of [-1,1])push(`${tag}-portal-jamb`,'gunmetal',x+.06,.92,center+z*(panelD/2+.065),.16,1.83,.15);
    push(`${tag}-portal-header`,'zinc',x+.075,1.81,center,.22,.17,panelD+.32);
    push(`${tag}-gantry-canopy`,'gunmetal',face+.31,2.01,center,.63,.13,panelD+.47);
    if(mainBay)push(`${tag}-canopy-strut-a`,'zinc',face+.27,1.85,center-panelD*.35,.07,.27,.07);
    if(mainBay)push(`${tag}-canopy-strut-b`,'zinc',face+.27,1.85,center+panelD*.35,.07,.27,.07);
    push(`${tag}-loading-sill`,'gunmetal',x+.06,.18,center,.18,.14,panelD+.28);
    // Broad aged warning stripe legible at the real tactical zoom.
    push(`${tag}-caution-sill`,'caution',x+.153,.26,center,.023,.10,panelD*.84);
    if(high&&mainBay){
      for(const y of [.48,.92,1.37])
        push(`${tag}-shutter-rib-${y}`,'gunmetal',x+.075,y,center,.038,.035,panelD-.08);
      // A dark vertical utility run catches the warm industrial practicals.
      push(`${tag}-downfeed`,'zinc',face+.04,1.46,b.z+b.d*.40,.15,.96,.14);
      push(`${tag}-downfeed-box`,'shutter',face+.075,1.00,b.z+b.d*.40,.19,.33,.28);
    }
    if(ultra&&mainBay){
      for(const z of [-1,1]){
        push(`${tag}-caution-post-${z}`,'caution',x+.153,.60,center+z*(panelD/2+.055),.032,.62,.064);
        push(`${tag}-facade-vent-${z}`,'zinc',face+.06,Math.min(b.h-.3,2.10),center+z*(panelD*.65),.14,.13,.30);
      }
    }
  }
  // Distinct overhead service conduit between the actual OFFICE and STORAGE
  // roofs. Derived from their mesh bounds, never a second hard-coded map.
  const office=valid.find(b=>b.name==='OFFICE');
  const storage=valid.find(b=>b.name==='STORAGE');
  if(office&&storage){
    const a=office.x+office.w/2-.08, b=storage.x-storage.w/2+.08;
    const span=b-a;
    if(span>1.0&&span<12){
      const px=(a+b)/2,pz=(office.z+storage.z)/2+.12;
      const y=Math.max(CHESSCOM_INDUSTRIAL_COMPOUND_V27.minPipeClearance,office.h+.28,storage.h+.28);
      for(const z of [-.18,.18])push('roof-service-main','zinc',px,y,pz+z,span+.45,.12,.12);
      push('roof-service-tray','gunmetal',px,y-.20,pz,span+.44,.075,.55);
      for(const x of [a+.12,b-.12])
        push('roof-service-landing','gunmetal',x,y-.28,pz,.18,.48,.59);
      if(high){
        for(const x of [a+span*.50]){
          push('roof-conduit-bridge','gunmetal',x,y+.045,pz,.09,.20,.60);
          push('roof-conduit-clamp','caution',x,y+.17,pz,.20,.045,.55);
        }
      }
    }
  }
  return pieces;
}

function material(B,scene,name,hex){
  const m=new B.StandardMaterial(name,scene);
  m.diffuseColor=B.Color3.FromHexString(hex);
  m.specularColor=B.Color3.FromHexString('#232b2c');
  m.specularPower=48;
  return m;
}

export function installChesscomIndustrialCompoundV27(B,scene,{tier='ultra',host}={}){
  const disposal=[];
  const masters=new Map();
  let partCount=0;
  try {
    const buildings=[];
    for(const name of CHESSCOM_INDUSTRIAL_COMPOUND_V27.buildingNames){
      const mesh=scene.getMeshByName?.(`building-${name}`);
      if(!mesh)continue;
      mesh.computeWorldMatrix?.(true);
      const bb=mesh.getBoundingInfo?.()?.boundingBox;
      if(!bb)continue;
      const {minimumWorld:min,maximumWorld:max}=bb;
      buildings.push({name,x:(min.x+max.x)/2,z:(min.z+max.z)/2,
        w:max.x-min.x,d:max.z-min.z,h:max.y});
    }
    const parts=chesscomIndustrialCompoundParts(buildings,tier);
    for(const [finish,hex] of Object.entries(FINISHES)){
      const m=material(B,scene,`industrial-v27-${finish}`,hex);
      const template=B.MeshBuilder.CreateBox(`industrial-v27-template-${finish}`,{size:1},scene);
      template.material=m;template.position.set(0,-1000,0);
      template.isPickable=false;
      masters.set(finish,template);
      disposal.push(m,template);
    }
    parts.forEach((part,index)=>{
      const mesh=masters.get(part.finish)?.createInstance?.(`industrial-v27-${index}-${part.name}`);
      if(!mesh)return;
      mesh.position.set(part.x,part.y,part.z);
      mesh.scaling.set(part.w,part.h,part.d);
      mesh.isPickable=false;
      // Scene already has heavy PCSS shadows; facade trim doesn't need them.
      mesh.receiveShadows=false;
      mesh.metadata={decorative:true,visual:'industrial-compound-v27'};
      disposal.push(mesh);
      partCount++;
    });
    if(host)host.dataset.chesscomCompound=CHESSCOM_INDUSTRIAL_COMPOUND_V27.identity;
    return {counts:{buildings:buildings.length,parts:partCount,templates:masters.size},
      destroy(){
        for(const obj of disposal.reverse())try{obj.dispose?.();}catch{}
        if(host)delete host.dataset.chesscomCompound;
      },
    };
  }catch(e){
    for(const obj of disposal.reverse())try{obj.dispose?.();}catch{}
    if(host)delete host.dataset.chesscomCompound;
    throw e;
  }
}
