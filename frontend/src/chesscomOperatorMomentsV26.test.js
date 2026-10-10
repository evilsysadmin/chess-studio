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

  it('has exactly one reusable non-pickable cue and no extra light on balanced/mobile',()=>{
    const disposed=[];
    const spawned=[];
    class Color3{
      constructor(r,g,b){this.r=r;this.g=g;this.b=b;}
      static FromHexString(){return new Color3(.1,.2,.3);}
      scale(){return this;}
    }
    class Node{
      constructor(name){this.name=name;this.position={set(x,y,z){this.x=x;this.y=y;this.z=z;}};this.rotation={x:0};this.scaling={set(){}};spawned.push(this);}
      setEnabled(enabled){this.enabled=enabled;}
      dispose(){disposed.push(this.name);}
    }
    const B={
      Color3,Vector3:class{constructor(x,y,z){Object.assign(this,{x,y,z});}},
      TransformNode:Node,
      StandardMaterial:class{constructor(name){this.name=name;}dispose(){disposed.push(this.name);}},
      MeshBuilder:{CreateTorus:(name)=>new Node(name),CreateLineSystem:(name)=>new Node(name)},
      PointLight:class{constructor(){throw Error('balanced must not allocate a light');}},
    };
    let frame=null,removed=false;
    const scene={
      onBeforeRenderObservable:{add(cb){frame=cb;return 1;},remove(){removed=true;}},
      getTransformNodeByName(name){
        return name==='unit-sven'?{position:{x:-5,z:3},isEnabled:()=>true}
          :{position:{x:-2,z:3},isEnabled:()=>true};
      },
    };
    const host={dataset:{}};
    const layer=installChesscomOperatorMomentsV26(B,scene,{tier:'balanced',host,reducedMotion:true});
    expect(spawned.map(x=>x.name)).toEqual(['chesscom-moment-v26-root','chesscom-moment-v26-ring']);
    expect(spawned[1].isPickable).toBe(false);
    layer.update(state(),{selectedId:'matthias'});
    frame();
    expect(host.dataset.chesscomFocusUnit).toBe('matthias');
    expect(spawned[0].enabled).toBe(true);
    layer.update(state(),{selectedId:'sven'});
    expect(host.dataset.chesscomMoment).toBe('selection');
    frame();
    expect(spawned[0].position.x).toBe(-5);
    layer.update(state(3),{selectedId:'sven'});
    expect(host.dataset.chesscomMoment).toBe('hit');
    layer.destroy();layer.destroy();
    expect(removed).toBe(true);
    expect(disposed.filter(x=>x==='chesscom-moment-v26-ring')).toHaveLength(1);
    expect(host.dataset.chesscomOperatorMoments).toBeUndefined();
  });
});
