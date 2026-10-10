import { describe, expect, it } from 'vitest';
import {
  CHESSCOM_INDUSTRIAL_ARCHITECTURE_V19,
  chesscomIndustrialArchitectureParts,
  installChesscomIndustrialArchitectureV19,
} from './chesscomIndustrialArchitectureV19.js';

const site={x:0,z:0,w:4.6,d:2.4,h:2.45};

describe('Chesscom Dust Veil industrial architecture v19',()=>{
  it('generates a bounded tier-dependent building silhouette without fake ground cover',()=>{
    const balanced=chesscomIndustrialArchitectureParts(site,'balanced');
    const high=chesscomIndustrialArchitectureParts(site,'high');
    const ultra=chesscomIndustrialArchitectureParts(site,'ultra');
    expect(CHESSCOM_INDUSTRIAL_ARCHITECTURE_V19.buildingNames).toHaveLength(4);
    expect(balanced).toHaveLength(11);
    expect(high).toHaveLength(24);
    expect(ultra).toHaveLength(29);
    expect(ultra.length).toBeLessThanOrEqual(CHESSCOM_INDUSTRIAL_ARCHITECTURE_V19.maxPartsPerBuilding);
    for(const piece of ultra){
      expect([piece.x,piece.y,piece.z,piece.w,piece.h,piece.d].every(Number.isFinite)).toBe(true);
      expect(piece.w*piece.h*piece.d).toBeGreaterThan(0);
      // The architecture occupies existing facade/roof space, not new
      // independent cover objects in the tactical floor.
      expect(piece.y-piece.h/2).toBeGreaterThanOrEqual(-.001);
      expect(['steel','zinc','rust','ochre']).toContain(piece.finish);
    }
    expect(chesscomIndustrialArchitectureParts({...site,w:0},'ultra')).toEqual([]);
  });

  it('creates only non-pickable instances and cleans up scene-owned resources',()=>{
    const instances=[],disposed=[];
    const master=(name)=>({
      name,position:{set(){}},isPickable:true,
      createInstance(instanceName){
        const item={name:instanceName,position:{set(){}},scaling:{set(){}},isPickable:true,
          dispose(){disposed.push(instanceName);}};
        instances.push(item);return item;
      },
      dispose(){disposed.push(name);},
    });
    const box={minimumWorld:{x:-2.3,y:0,z:-1.2},maximumWorld:{x:2.3,y:2.45,z:1.2}};
    const B={
      Color3:class Color3 {static FromHexString(hex){return hex;}},
      StandardMaterial:class{constructor(name){this.name=name;}dispose(){disposed.push(this.name);}},
      MeshBuilder:{CreateBox:(name)=>master(name)},
    };
    const scene={
      getMeshByName:(name)=>name==='building-OFFICE'
        ?{computeWorldMatrix(){},getBoundingInfo:()=>({boundingBox:box})}:null,
    };
    const host={dataset:{}};
    const layer=installChesscomIndustrialArchitectureV19(B,scene,{tier:'balanced',host});
    expect(layer.counts).toMatchObject({buildings:1,parts:11,templates:4});
    expect(instances).toHaveLength(11);
    expect(instances.every(x=>x.isPickable===false)).toBe(true);
    expect(host.dataset.chesscomArchitecture).toBe('industrial-architecture-v19');
    layer.destroy();
    expect(disposed).toHaveLength(19);
    expect(host.dataset.chesscomArchitecture).toBeUndefined();
  });
});
