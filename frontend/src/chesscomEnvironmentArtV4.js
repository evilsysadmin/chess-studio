export const CHESSCOM_ENVIRONMENT_ART_V4 = Object.freeze({
  identity:'environment-art-v4',
  decals:'procedural-ground-decals',
  dressing:'restrained-microprops',
});

function decalTexture(B,scene,name,kind,disposables){
  const texture=new B.DynamicTexture(name,{width:128,height:128},scene,false);
  texture.hasAlpha=true;texture.wrapU=B.Texture.CLAMP_ADDRESSMODE;texture.wrapV=B.Texture.CLAMP_ADDRESSMODE;
  const ctx=texture.getContext();ctx.clearRect(0,0,128,128);
  if(kind==='oil'){
    const g=ctx.createRadialGradient(64,64,7,64,64,56);
    g.addColorStop(0,'rgba(5,8,9,.72)');g.addColorStop(.48,'rgba(8,13,15,.46)');g.addColorStop(.82,'rgba(13,20,22,.17)');g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
    for(let i=0;i<17;i+=1){const x=(i*41)%112+8,y=(i*67)%110+9,r=2+(i%4)*1.7;ctx.fillStyle=`rgba(30,38,40,${.05+(i%3)*.025})`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
  }else{
    for(let i=0;i<22;i+=1){const x=(i*37)%118+5,y=(i*53)%118+5;ctx.fillStyle=`rgba(26,24,21,${.08+(i%4)*.025})`;ctx.fillRect(x,y,1+(i%3),1+(i%2));}
    ctx.strokeStyle='rgba(31,27,23,.15)';ctx.lineWidth=1;
    for(let i=0;i<7;i+=1){ctx.beginPath();ctx.moveTo(12+i*15,18);ctx.lineTo(23+i*13,109);ctx.stroke();}
  }
  texture.update(false);disposables.push(texture);return texture;
}

function decalMaterial(B,scene,name,texture,alpha,disposables){
  const mat=new B.StandardMaterial(name,scene);mat.diffuseTexture=texture;mat.opacityTexture=texture;mat.useAlphaFromDiffuseTexture=true;mat.disableLighting=false;mat.specularColor=B.Color3.Black();mat.alpha=alpha;mat.backFaceCulling=false;mat.needDepthPrePass=true;disposables.push(mat);return mat;
}

function addGroundDecals(B,scene,tier,disposables){
  const oil=decalMaterial(B,scene,'environment-v4-oil-mat',decalTexture(B,scene,'environment-v4-oil','oil',disposables),.72,disposables);
  const grime=decalMaterial(B,scene,'environment-v4-grime-mat',decalTexture(B,scene,'environment-v4-grime','grime',disposables),.48,disposables);
  const spots=[
    [-3.75,-3.18,1.45,.78,.18,'oil'],[-1.18,-.92,1.15,.62,-.25,'grime'],[2.28,-2.86,1.30,.70,.11,'oil'],
    [4.08,.72,1.05,.55,-.32,'grime'],[-4.62,2.16,1.18,.61,.08,'grime'],[1.12,3.92,1.35,.74,.31,'oil'],
    [4.96,4.25,.92,.48,-.16,'grime'],[-.45,1.82,.88,.42,.27,'grime'],
  ];
  const count=tier==='balanced'?4:tier==='high'?6:spots.length;
  spots.slice(0,count).forEach(([x,z,w,h,r,kind],index)=>{
    const plane=B.MeshBuilder.CreatePlane(`environment-v4-decal-${index}`,{width:w,height:h,sideOrientation:B.Mesh.DOUBLESIDE},scene);
    plane.rotation.x=Math.PI/2;plane.rotation.z=r;plane.position.set(x,.034,z);plane.material=kind==='oil'?oil:grime;plane.isPickable=false;disposables.push(plane);
  });
}

function finishMat(B,scene,name,hex,spec,power,disposables){
  const mat=new B.StandardMaterial(name,scene);mat.diffuseColor=B.Color3.FromHexString(hex);mat.specularColor=B.Color3.FromHexString(spec);mat.specularPower=power;disposables.push(mat);return mat;
}

function addCasings(B,scene,tier,disposables){
  const brass=finishMat(B,scene,'environment-v4-casing-brass','#7a5b2c','#b9944d',92,disposables);
  const steel=finishMat(B,scene,'environment-v4-debris-steel','#202629','#4b5559',74,disposables);
  const casings=[[-1.9,-.35,.23],[-1.68,-.28,-.17],[-.94,2.75,.08],[2.36,1.82,-.30],[3.48,-1.36,.21],[.55,-3.42,-.12],[4.12,3.08,.26]];
  const count=tier==='balanced'?3:tier==='high'?5:casings.length;
  casings.slice(0,count).forEach(([x,z,r],index)=>{
    const shell=B.MeshBuilder.CreateCylinder(`environment-v4-casing-${index}`,{height:.13,diameter:.035,tessellation:8},scene);
    shell.position.set(x,.055,z);shell.rotation.z=Math.PI/2+r;shell.rotation.y=r*.7;shell.material=brass;shell.isPickable=false;disposables.push(shell);
  });
  const debris=[[-3.05,1.12,.22,.05,.12],[1.78,-4.02,.30,.04,.09],[4.72,-2.22,.18,.045,.15],[-4.20,-.62,.24,.035,.10]];
  debris.slice(0,tier==='balanced'?2:debris.length).forEach(([x,z,w,h,d],index)=>{
    const chip=B.MeshBuilder.CreateBox(`environment-v4-chip-${index}`,{width:w,height:h,depth:d},scene);chip.position.set(x,.05,z);chip.rotation.y=index*.73;chip.rotation.z=.08*(index%2?1:-1);chip.material=steel;chip.isPickable=false;disposables.push(chip);
  });
}

function addContactFill(B,scene,tier,disposables){
  if(tier==='balanced')return;
  const fill=new B.HemisphericLight('environment-v4-contact-fill',new B.Vector3(.15,1,.05),scene);
  fill.diffuse=new B.Color3(.075,.095,.11);fill.groundColor=new B.Color3(.006,.008,.009);fill.intensity=tier==='ultra'?.22:.15;disposables.push(fill);
}

export function installChesscomEnvironmentArtV4(B,scene,{tier='ultra'}={}){
  const disposables=[];addGroundDecals(B,scene,tier,disposables);addCasings(B,scene,tier,disposables);addContactFill(B,scene,tier,disposables);
  return {destroy(){for(const item of disposables.reverse()){try{item?.dispose?.();}catch{}}}};
}
