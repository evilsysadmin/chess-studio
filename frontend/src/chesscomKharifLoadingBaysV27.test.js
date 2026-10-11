import {describe,expect,it} from 'vitest';
import {
  CHESSCOM_KHARIF_LOADING_BAYS_V27,
  chesscomKharifLoadingBayParts,
  installChesscomKharifLoadingBaysV27,
} from './chesscomKharifLoadingBaysV27.js';

const building={x:0,z:0,w:4.6,d:2.4,h:2.45};

describe('CHESSCOM Kharif loading bays v27',()=>{
  it('adds visible industrial docks, shutters and rooftop equipment within a bounded budget',()=>{
    const balanced=chesscomKharifLoadingBayParts(building,'balanced','STORAGE');
    const high=chesscomKharifLoadingBayParts(building,'high','STORAGE');
    const ultra=chesscomKharifLoadingBayParts(building,'ultra','STORAGE');
    expect(CHESSCOM_KHARIF_LOADING_BAYS_V27.identity).toBe('kharif-loading-bays-v27');
    expect(balanced).toHaveLength(13);
    expect(high).toHaveLength(21);
    expect(ultra).toHaveLength(26);
    expect(ultra.length).toBeLessThan(CHESSCOM_KHARIF_LOADING_BAYS_V27.maxPartsPerBuilding);
    expect(balanced.filter(p=>p.name==='shutter-rib')).toHaveLength(4);
    expect(high.map(p=>p.name)).toContain('roof-pressure-tank');
    expect(ultra.map(p=>p.name)).toContain('roof-access-bridge');
    for(const p of ultra){
      expect([p.x,p.y,p.z,p.w,p.h,p.d,p.rz].every(Number.isFinite)).toBe(true);
      expect(Math.min(p.w,p.h,p.d)).toBeGreaterThan(0);
      expect(p.y-p.h/2).toBeGreaterThanOrEqual(0);
      expect(['box','cylinder']).toContain(p.shape);
    }
    // Invalid geometry does not generate prop collisions or NaN matrices.
    expect(chesscomKharifLoadingBayParts({...building,d:0})).toEqual([]);
    expect(chesscomKharifLoadingBayParts({...building,x:NaN})).toEqual([]);
  });

  it('installs only non-pickable instanced decoration with deterministic teardown',()=>{
    const disposed=[],instances=[];
    function mesh(name){
      return {
        name,position:{set(){}},scaling:{set(){}},rotation:{z:0},isPickable:true,
        createInstance(n){const item=mesh(n);instances.push(item);return item;},
        dispose(){disposed.push(name);},
      };
    }
    const boxes={
      'building-OFFICE':{
        computeWorldMatrix(){},
        getBoundingInfo:()=>({boundingBox:{
          minimumWorld:{x:-2.3,y:0,z:-1.2},
          maximumWorld:{x:2.3,y:2.45,z:1.2},
        }}),
      },
    };
    const B={
      Color3:class{constructor(){}static FromHexString(){return {hex:'#fff'};}},
      StandardMaterial:class{constructor(n){this.name=n;}dispose(){disposed.push(this.name);}},
      MeshBuilder:{
        CreateBox:(name)=>mesh(name),
        CreateCylinder:(name)=>mesh(name),
      },
    };
    const host={dataset:{}};
    const layer=installChesscomKharifLoadingBaysV27(B,{getMeshByName:n=>boxes[n]},{tier:'balanced',host});
    expect(layer.counts).toMatchObject({buildings:1,parts:13});
    expect(instances).toHaveLength(13);
    expect(instances.every(m=>!m.isPickable)).toBe(true);
    expect(instances.every(m=>!('metadata' in m))).toBe(true);
    expect(host.dataset.chesscomLoadingBays).toBe('kharif-loading-bays-v27');
    layer.destroy();
    expect(layer.counts.templates).toBe(8);
    expect(disposed.length).toBe(13+8+6);
    expect(host.dataset.chesscomLoadingBays).toBeUndefined();
  });
});
