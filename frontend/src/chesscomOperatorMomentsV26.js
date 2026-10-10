// Cinematic beats on existing Babylon tactical markers. We add no meshes,
// lights, shader passes or render observers: the original renderer owns all
// geometry, hit targets and frame pacing.
export const CHESSCOM_OPERATOR_MOMENTS_V26=Object.freeze({
  identity:'operator-moments-v26',
  hitDuration:820,
  shotDuration:470,
  selectionDuration:340,
  selectedScale:1.16,
  momentScale:1.22,
});

export function chesscomMomentSnapshot(state,selectedId){
  const allies=state?.friendlies||[];
  const units=[...allies,...(state?.enemies||[])];
  return {
    selectedId:selectedId||null,
    units:units.map(unit=>({
      id:unit.id,hp:Number(unit.hp)||0,ammo:Number(unit.ammo)||0,
      friendly:allies.some(a=>a.id===unit.id),
    })),
  };
}

export function chesscomMomentTransition(previous,current){
  if(!previous||!current)return null;
  const prior=new Map(previous.units.map(u=>[u.id,u]));
  for(const unit of current.units){
    const old=prior.get(unit.id);
    if(old && unit.hp<old.hp) return {
      kind:unit.hp<=0?'down':'hit',unitId:unit.id,friendly:unit.friendly,
    };
  }
  for(const unit of current.units){
    const old=prior.get(unit.id);
    if(old && unit.friendly && unit.hp>0 && unit.ammo<old.ammo)
      return {kind:'shot',unitId:unit.id,friendly:true};
  }
  if(current.selectedId && current.selectedId!==previous.selectedId)
    return {kind:'selection',unitId:current.selectedId,friendly:true};
  return null;
}

export function installChesscomOperatorMomentsV26(_B,scene,{host}={}){
  let previous=null;
  let selectedId=null;
  let disposed=false;
  const touched=new Set();
  function markerFor(id){return scene?.getMeshByName?.(`marker-${id}`)||null;}
  function update(state,ui={}){
    if(disposed)return;
    const candidate=ui.selectedId??state?.selectedId??state?.friendlies?.[0]?.id??null;
    const snapshot=chesscomMomentSnapshot(state,candidate);
    const event=chesscomMomentTransition(previous,snapshot);
    previous=snapshot;
    if(selectedId!==candidate){
      const oldMarker=selectedId?markerFor(selectedId):null;
      if(oldMarker?.metadata)oldMarker.metadata.operatorFocus=false;
      selectedId=candidate;
    }
    const selectedMarker=selectedId?markerFor(selectedId):null;
    if(selectedMarker){
      selectedMarker.metadata||={};
      selectedMarker.metadata.operatorFocus=true;
      touched.add(selectedMarker);
    }
    if(event){
      const marker=markerFor(event.unitId);
      if(marker){
        marker.metadata||={};
        marker.metadata.momentUntil=performance.now()+(
          event.kind==='selection'?CHESSCOM_OPERATOR_MOMENTS_V26.selectionDuration:
          event.kind==='shot'?CHESSCOM_OPERATOR_MOMENTS_V26.shotDuration:
          CHESSCOM_OPERATOR_MOMENTS_V26.hitDuration
        );
        marker.metadata.momentBaseVisible=marker.isVisible;
        marker.isVisible=true;
        touched.add(marker);
      }
    }
    if(host){
      host.dataset.chesscomOperatorMoments=CHESSCOM_OPERATOR_MOMENTS_V26.identity;
      host.dataset.chesscomFocusUnit=selectedId||'none';
      host.dataset.chesscomMoment=event?.kind||'idle';
    }
  }
  if(host)host.dataset.chesscomOperatorMoments=CHESSCOM_OPERATOR_MOMENTS_V26.identity;
  return{
    update,
    destroy(){
      if(disposed)return;
      disposed=true;
      for(const marker of touched){
        if(!marker||marker.isDisposed?.())continue;
        if(marker.metadata){
          marker.metadata.operatorFocus=false;
          delete marker.metadata.momentUntil;
          delete marker.metadata.momentBaseVisible;
        }
        marker.scaling?.set?.(1,1,1);
      }
      touched.clear();
      if(host){
        delete host.dataset.chesscomOperatorMoments;
        delete host.dataset.chesscomFocusUnit;
        delete host.dataset.chesscomMoment;
      }
    },
  };
}
