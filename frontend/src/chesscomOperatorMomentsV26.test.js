import { describe,expect,it } from 'vitest';
import {
  CHESSCOM_OPERATOR_MOMENTS_V26,
  chesscomMomentSnapshot,
  chesscomMomentTransition,
  installChesscomOperatorMomentsV26,
} from './chesscomOperatorMomentsV26.js';

const state=(hp=8,ammo=30)=>({
  friendlies:[{id:'matthias',hp:9,ammo:30,x:2,y:6},{id:'sven',hp:8,ammo,x:1,y:6}],
  enemies:[{id:'guard-1',hp,ammo:20,x:7,y:3}],
});

describe('CHESSCOM operator moments v26',()=>{
  it('only reacts to real selection, ammo or HP changes, prioritizing casualties',()=>{
    const initial=chesscomMomentSnapshot(state(),'matthias');
    expect(chesscomMomentTransition(null,initial)).toBeNull();
    expect(chesscomMomentTransition(initial,chesscomMomentSnapshot(state(),'matthias'))).toBeNull();
    expect(chesscomMomentTransition(initial,chesscomMomentSnapshot(state(),'sven')))
      .toEqual({kind:'selection',unitId:'sven',friendly:true});
    expect(chesscomMomentTransition(initial,chesscomMomentSnapshot(state(8,28),'matthias')))
      .toEqual({kind:'shot',unitId:'sven',friendly:true});
    expect(chesscomMomentTransition(initial,chesscomMomentSnapshot(state(4,28),'matthias')))
      .toEqual({kind:'hit',unitId:'guard-1',friendly:false});
    expect(chesscomMomentTransition(initial,chesscomMomentSnapshot(state(0,28),'matthias')))
      .toEqual({kind:'down',unitId:'guard-1',friendly:false});
    expect(CHESSCOM_OPERATOR_MOMENTS_V26.hitDuration).toBeLessThan(1000);
  });

  it('reuses native Babylon tactical markers without allocating any lights or meshes',()=>{
    const marker=(visible=true)=>({
      metadata:{},isVisible:visible,scaling:{
        last:null,set(x,y,z){this.last=[x,y,z];},
      },
    });
    const markers={
      'marker-matthias':marker(true),
      'marker-sven':marker(false),
      'marker-guard-1':marker(false),
    };
    const scene={
      getMeshByName(name){return markers[name]||null;},
      // Mock deliberately offers no MeshBuilder, PointLight or render observer.
    };
    const host={dataset:{}};
    const layer=installChesscomOperatorMomentsV26(null,scene,{host,tier:'ultra'});
    expect(host.dataset.chesscomOperatorMoments).toBe('operator-moments-v26');
    layer.update(state(),{selectedId:'matthias'});
    expect(markers['marker-matthias'].metadata.operatorFocus).toBe(true);
    expect(host.dataset.chesscomFocusUnit).toBe('matthias');
    layer.update(state(),{selectedId:'sven'});
    expect(markers['marker-matthias'].metadata.operatorFocus).toBe(false);
    expect(markers['marker-sven'].metadata.operatorFocus).toBe(true);
    expect(markers['marker-sven'].metadata.momentUntil).toBeGreaterThan(performance.now());
    expect(host.dataset.chesscomMoment).toBe('selection');
    layer.update(state(3),{selectedId:'sven'});
    expect(host.dataset.chesscomMoment).toBe('hit');
    expect(markers['marker-guard-1'].isVisible).toBe(true);
    expect(markers['marker-guard-1'].metadata.momentBaseVisible).toBe(false);
    layer.destroy();layer.destroy();
    expect(markers['marker-sven'].metadata.operatorFocus).toBe(false);
    expect(markers['marker-guard-1'].metadata.momentUntil).toBeUndefined();
    expect(host.dataset.chesscomOperatorMoments).toBeUndefined();
  });
});

describe('CHESSCOM discreet grounded focus v28',()=>{
  it('does not grow into a bright arcade halo or pulse constantly',()=>{
    expect(CHESSCOM_OPERATOR_MOMENTS_V26.selectedScale).toBeLessThanOrEqual(1.04);
    expect(CHESSCOM_OPERATOR_MOMENTS_V26.momentScale).toBeLessThanOrEqual(1.11);
    expect(CHESSCOM_OPERATOR_MOMENTS_V26.selectedScale).toBeGreaterThanOrEqual(1);
  });
});
