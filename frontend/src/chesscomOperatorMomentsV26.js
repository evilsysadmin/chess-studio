// Dust Veil moment direction: light the actor, never pan the tactical camera.
// All attention cues are derived from the canonical combat state and are
// non-pickable: they do not create cover, targets or input hitboxes.
export const CHESSCOM_OPERATOR_MOMENTS_V26=Object.freeze({
  identity:'operator-moments-v26',
  hitDuration:820,
  shotDuration:470,
  selectionDuration:340,
});

export function chesscomMomentSnapshot(state, selectedId) {
  const units=[...(state?.friendlies||[]),...(state?.enemies||[])];
  return {
    selectedId:selectedId||null,
    units:units.map(u=>({id:u.id,hp:Number(u.hp)||0,ammo:Number(u.ammo)||0,friendly:(state?.friendlies||[]).some(a=>a.id===u.id)})),
  };
}

export function chesscomMomentTransition(previous,current) {
  if(!previous||!current)return null;
  const old=new Map(previous.units.map(u=>[u.id,u]));
  // Consequences are more important than a simultaneous selection or ammo
  // update; never fabricate events from locations/animations alone.
  for(const unit of current.units) {
    const prior=old.get(unit.id);
    if(prior && unit.hp<prior.hp)
      return {kind:unit.hp<=0?'down':'hit',unitId:unit.id,friendly:unit.friendly};
  }
  for(const unit of current.units) {
    const prior=old.get(unit.id);
    if(prior && unit.friendly && unit.hp>0 && unit.ammo<prior.ammo)
      return {kind:'shot',unitId:unit.id,friendly:true};
  }
  if(current.selectedId&&current.selectedId!==previous.selectedId)
    return {kind:'selection',unitId:current.selectedId,friendly:true};
  return null;
}

export function installChesscomOperatorMomentsV26(B,scene,{tier='ultra',host,reducedMotion=false}={}){
  const root=new B.TransformNode('chesscom-moment-v26-root',scene);
  const makeMaterial=(name,color)=>{
    const m=new B.StandardMaterial(name,scene);
    m.diffuseColor=B.Color3.FromHexString(color);
    m.emissiveColor=B.Color3.FromHexString(color).scale(.65);
    m.alpha=.70;
    m.disableLighting=true;
    m.backFaceCulling=false;
    return m;
  };
  const cool=makeMaterial('chesscom-moment-v26-cool','#4c9295');
  const hot=makeMaterial('chesscom-moment-v26-hot','#c78356');
  const ring=B.MeshBuilder.CreateTorus('chesscom-moment-v26-ring',{diameter:1.68,thickness:.045,tessellation:40},scene);
  ring.parent=root;ring.rotation.x=Math.PI/2;ring.position.y=.085;ring.material=cool;ring.isPickable=false;
  // Two miniature side markers help read the operative silhouette even on
  // dark asphalt; omit this geometry and the local light on coarse hardware.
  let braces=null;
  if(tier!=='balanced' && B.MeshBuilder.CreateLineSystem){
    const lines=[];
    for(const side of [-1,1]){
      for(const z of [-.32,.32]){
        lines.push([
          new B.Vector3(side*.57,.22,z),
          new B.Vector3(side*.57,.63,z),
          new B.Vector3(side*.49,.63,z),
        ]);
      }
    }
    braces=B.MeshBuilder.CreateLineSystem('chesscom-moment-v26-braces',{lines},scene);
    braces.parent=root;
    braces.color=new B.Color3(.36,.72,.74);
    braces.alpha=.64;
    braces.isPickable=false;
  }
  const light=tier==='balanced'?null:new B.PointLight('chesscom-moment-v26-fill',new B.Vector3(0,1.42,0),scene);
  if(light){
    light.diffuse=new B.Color3(.28,.64,.68);
    light.specular=new B.Color3(.08,.12,.12);
    light.range=2.8;
    light.intensity=0;
  }
  const coolLight=new B.Color3(.28,.64,.68);
  const hotLight=new B.Color3(.96,.42,.21);
  const coolBraces=new B.Color3(.36,.72,.74);
  const hotBraces=new B.Color3(.89,.52,.29);
  const glow=scene.getEffectLayerByName?.('ops-glow');
  glow?.addIncludedOnlyMesh?.(ring);
  let selectedId=null;
  let litUnitId=null;
  let highlight=null;
  let previous=null;
  let lastState=null;
  let disposed=false;

  function unitPosition(id) {
    const unit=[...(lastState?.friendlies||[]),...(lastState?.enemies||[])].find(u=>u.id===id);
    if(!unit)return null;
    const node=scene.getTransformNodeByName?.(`unit-${id}`);
    if(node?.isEnabled?.()!==false&&node?.position) return {x:node.position.x,z:node.position.z};
    // Keep a death cue on the real last tile after the unit mesh disappears.
    return {x:-6.975+unit.x*1.55,z:-5.425+unit.y*1.55};
  }
  function update(state,ui={}){
    if(disposed)return;
    const candidate=ui.selectedId??state?.selectedId??state?.friendlies?.[0]?.id??null;
    const snapshot=chesscomMomentSnapshot(state,candidate);
    const event=chesscomMomentTransition(previous,snapshot);
    previous=snapshot;
    lastState=state;
    selectedId=candidate;
    if(event){
      highlight={
        ...event,
        expiry:performance.now()+(event.kind==='selection'
          ?CHESSCOM_OPERATOR_MOMENTS_V26.selectionDuration
          :event.kind==='shot'?CHESSCOM_OPERATOR_MOMENTS_V26.shotDuration
          :CHESSCOM_OPERATOR_MOMENTS_V26.hitDuration),
      };
    }
    if(host){
      host.dataset.chesscomOperatorMoments=CHESSCOM_OPERATOR_MOMENTS_V26.identity;
      host.dataset.chesscomFocusUnit=selectedId||'none';
      host.dataset.chesscomMoment=event?.kind||'idle';
    }
  }
  function frame(){
    if(disposed)return;
    const now=performance.now();
    if(highlight && now>=highlight.expiry)highlight=null;
    const highlightedId=highlight?.unitId||selectedId;
    const p=highlightedId?unitPosition(highlightedId):null;
    if(light && litUnitId!==highlightedId){
      // Light only the acting character, not hundreds of wet tiles and
      // buildings. This prevents a global shader/light workload on SwiftShader.
      const actor=scene.getTransformNodeByName?.(`unit-${highlightedId}`);
      light.includedOnlyMeshes=actor?.getChildMeshes?.()||[];
      litUnitId=highlightedId;
    }
    root.setEnabled(Boolean(p));
    if(!p){if(light)light.intensity=0;return;}
    root.position.set(p.x,0,p.z);
    const danger=highlight?.kind==='hit'||highlight?.kind==='down';
    ring.material=danger?hot:cool;
    if(braces)braces.color=danger?hotBraces:coolBraces;
    if(!reducedMotion){
      const wave=highlight?Math.max(0,(highlight.expiry-now)/CHESSCOM_OPERATOR_MOMENTS_V26.hitDuration):0;
      const pulse=1+Math.sin(now*.005)*.018+wave*.07;
      root.scaling.set(pulse,1,pulse);
    }else root.scaling.set(1,1,1);
    if(light){
      light.position.set(p.x,1.4,p.z);
      light.diffuse=danger?hotLight:coolLight;
      light.intensity=danger?2.6:highlight?.kind==='shot'?2.0:1.15;
    }
  }
  const observer=scene.onBeforeRenderObservable?.add?.(frame);
  root.setEnabled(false);
  if(host)host.dataset.chesscomOperatorMoments=CHESSCOM_OPERATOR_MOMENTS_V26.identity;
  return {
    update,
    destroy(){
      if(disposed)return;
      disposed=true;
      if(observer)scene.onBeforeRenderObservable?.remove?.(observer);
      if(host){
        delete host.dataset.chesscomOperatorMoments;
        delete host.dataset.chesscomFocusUnit;
        delete host.dataset.chesscomMoment;
      }
      try{glow?.removeIncludedOnlyMesh?.(ring);}catch{}
      braces?.dispose?.();
      ring.dispose();
      root.dispose();
      light?.dispose?.();
      cool.dispose();
      hot.dispose();
    },
  };
}
