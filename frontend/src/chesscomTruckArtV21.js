// Kharif Outpost's six-wheel tactical support truck. All dimensions are in
// Babylon world units relative to the existing SCENERY truck anchor.
export const CHESSCOM_TRUCK_ART_V21 = Object.freeze({
  identity:'military-truck-v21',
  axles:Object.freeze([-1.25,.48,1.04]),
  nonInteractive:true,
});

export function chesscomTruckV21Parts(tier='ultra'){
  const detail=tier!=='balanced';
  const ultra=tier==='ultra';
  const parts=[];
  const box=(name,finish,x,y,z,w,h,d,rz=0)=>parts.push({kind:'box',name,finish,x,y,z,w,h,d,rz});
  const wheel=(name,finish,x,y,z,diameter,thickness)=>parts.push({kind:'wheel',name,finish,x,y,z,diameter,thickness});

  // A coherent 6x6 silhouette instead of unrelated rotated boxes. Positive
  // X points towards the rear; front is negative X.
  box('ladder-chassis','dark',-.11,.45,0,2.82,.22,.88);
  for(const z of [-.43,.43])box(`chassis-rail-${z}`,'steel',-.08,.43,z,2.75,.18,.11);
  box('front-hood','body',-1.48,.86,0,.73,.43,1.04);
  box('front-hood-top','body',-1.49,1.10,0,.68,.10,1.05,-.05);
  box('cab-shell','body',-.99,.98,0,.85,1.05,1.06);
  box('cab-roof','body',-1.02,1.57,0,1.00,.14,1.18);
  box('windshield','glass',-1.445,1.32,0,.045,.38,.76,-.20);
  for(const z of [-.55,.55]){
    box(`door-${z}`,'body',-.94,.84,z,.72,.61,.06);
    box(`window-${z}`,'glass',-1.00,1.30,z,.54,.36,.036);
    box(`door-rim-${z}`,'steel',-.94,1.08,z,.72,.055,.075);
    box(`step-${z}`,'steel',-.99,.50,z*1.25,.72,.08,.14);
    box(`mirror-arm-${z}`,'dark',-1.43,1.34,z*1.15,.10,.04,.18);
    box(`mirror-${z}`,'steel',-1.46,1.35,z*1.34,.10,.18,.06);
  }
  box('radiator-grille','dark',-1.83,.79,0,.052,.30,.68);
  for(const z of [-.24,-.08,.08,.24])box(`grille-slot-${z}`,'steel',-1.866,.79,z,.025,.23,.02);
  box('front-bumper','steel',-1.84,.52,0,.13,.17,1.21);
  for(const z of [-.45,.45])box(`front-lamp-${z}`,'lamp',-1.873,.96,z,.05,.14,.15);

  box('cargo-floor','steel',.50,.82,0,1.73,.16,1.22);
  box('cargo-front-bulkhead','body',-.31,1.23,0,.10,.72,1.22);
  box('cargo-tailgate','body',1.35,1.17,0,.09,.65,1.18);
  for(const z of [-.60,.60]){
    box(`cargo-wall-${z}`,'body',.51,1.15,z,1.68,.56,.10);
    box(`cargo-stripe-${z}`,'steel',.50,1.45,z*1.10,1.69,.055,.07);
  }
  // Enclosed olive-drab canvas canopy with a distinct upper silhouette.
  box('canvas-roof','canvas',.53,1.85,0,1.77,.16,1.24);
  for(const z of [-.58,.58])box(`canvas-valance-${z}`,'canvas',.52,1.66,z,1.70,.30,.09);
  for(const x of [-.19,1.19])box(`canvas-end-${x}`,'canvas',x,1.72,0,.10,.30,1.12);

  for(const x of CHESSCOM_TRUCK_ART_V21.axles)for(const z of [-.63,.63]){
    wheel(`tyre-${x}-${z}`,'tyre',x,.31,z,.65,.23);
    wheel(`hub-${x}-${z}`,'steel',x,.31,z+(z<0?-.13:.13),.30,.026);
  }

  if(detail){
    for(const x of [-.18,.44,1.16])box(`canopy-rib-${x}`,'steel',x,1.95,0,.055,.05,1.28);
    box('rear-recovery-hook','steel',1.45,.49,0,.20,.13,.35);
    box('front-winch','steel',-1.91,.47,0,.15,.19,.38);
    for(const z of [-.48,.48])box(`rear-lamp-${z}`,'warning',1.46,.94,z,.04,.16,.13);
    for(const z of [-.37,.37])box(`roof-rack-rail-${z}`,'dark',-1.02,1.70,z,.73,.06,.06);
    for(const x of [-1.35,-.71])box(`roof-rack-cross-${x}`,'steel',x,1.71,0,.055,.055,.79);
  }
  if(ultra){
    for(const x of [-.15,.55,1.18])for(const z of [-.615,.615])
      box(`cargo-rivet-${x}-${z}`,'steel',x,1.16,z,.045,.045,.045);
    box('cargo-number-plate','warning',.88,1.21,-.665,.26,.14,.035);
    for(const z of [-.51,.51])box(`mud-flap-${z}`,'dark',1.27,.28,z,.12,.32,.22);
  }
  return parts;
}

export function createChesscomTruckV21(B,scene,{x,z,mats,shadowGenerator,tier='ultra'}={}){
  if(!Number.isFinite(x)||!Number.isFinite(z))throw new Error('CHESSCOM truck anchor must be finite');
  const root=new B.TransformNode('truck-v21-root',scene);
  root.position.set(x,0,z);
  root.rotation.y=.18;
  root.metadata={visual:'military-truck-v21',decorative:true};
  const finishes={
    body:mats.truck,canvas:mats.truckCanvas,steel:mats.metalBright,
    dark:mats.metalDark,glass:mats.window,lamp:mats.headlight,
    tyre:mats.tire,warning:mats.barrel,
  };
  const shadowNames=new Set(['cab-shell','front-hood','cargo-tailgate','cargo-wall--0.6','cargo-wall-0.6','canvas-roof']);
  const parts=chesscomTruckV21Parts(tier);
  for(const item of parts){
    let mesh;
    if(item.kind==='wheel'){
      mesh=B.MeshBuilder.CreateCylinder(`truck-v21-${item.name}`,{height:item.thickness,diameter:item.diameter,tessellation:18},scene);
      mesh.rotation.x=Math.PI/2;
    }else{
      mesh=B.MeshBuilder.CreateBox(`truck-v21-${item.name}`,{width:item.w,height:item.h,depth:item.d},scene);
      mesh.rotation.z=item.rz;
    }
    mesh.parent=root;
    mesh.position.set(item.x,item.y,item.z);
    mesh.material=finishes[item.finish];
    mesh.isPickable=false;
    mesh.receiveShadows=true;
    mesh.metadata={visual:'military-truck-v21',decorative:true};
    if(shadowNames.has(item.name))shadowGenerator?.addShadowCaster?.(mesh);
  }
  return root;
}
