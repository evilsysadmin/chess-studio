import {describe,expect,it} from 'vitest';
import {
  CHESSCOM_INDUSTRIAL_COMPOUND_V27,
  chesscomIndustrialCompoundParts,
  installChesscomIndustrialCompoundV27,
} from './chesscomIndustrialCompoundV27.js';

const buildings=[
  {name:'OFFICE',x:-6.665,z:-5.115,w:4.6,d:2.4,h:2.45},
  {name:'STORAGE',x:2.325,z:-5.425,w:3.8,d:2.2,h:2.85},
  {name:'NO FLAGS',x:-6.51,z:1.395,w:3,d:2.3,h:2.15},
  {name:'JUST JOBS',x:4.185,z:2.635,w:2.9,d:2,h:2.25},
];

describe('CHESSCOM Kharif industrial compound V27',()=>{
  it('adds meaningful loading bay and roof services by tier without inventing obstacles',()=>{
    const balanced=chesscomIndustrialCompoundParts(buildings,'balanced');
    const high=chesscomIndustrialCompoundParts(buildings,'high');
    const ultra=chesscomIndustrialCompoundParts(buildings,'ultra');
    expect(CHESSCOM_INDUSTRIAL_COMPOUND_V27.buildingNames).toHaveLength(4);
    expect(balanced).toHaveLength(23);
    expect(high).toHaveLength(73);
    expect(ultra).toHaveLength(89);
    expect(ultra.length).toBeLessThanOrEqual(CHESSCOM_INDUSTRIAL_COMPOUND_V27.maxParts);
    expect(ultra.map(p=>p.name)).toContain('storage-loading-shutter');
    expect(ultra.map(p=>p.name)).toContain('office-gantry-canopy');
    expect(ultra.filter(p=>p.name==='roof-service-main')).toHaveLength(2);
    expect(ultra.filter(p=>p.name==='roof-conduit-bridge')).toHaveLength(2);
    expect(ultra.filter(p=>p.name.includes('shutter-rib')).length).toBe(20);
    for(const p of ultra){
      expect([p.x,p.y,p.z,p.w,p.h,p.d].every(Number.isFinite)).toBe(true);
      expect(Math.min(p.w,p.h,p.d)).toBeGreaterThan(0);
      expect(p.y-p.h/2).toBeGreaterThan(.005);
      expect(['shutter','gunmetal','zinc','caution']).toContain(p.finish);
    }
    // Sky bridge is above all characters and never on the walkable ground.
    for(const p of ultra.filter(p=>p.name.startsWith('roof-'))){
      expect(p.y-p.h/2).toBeGreaterThanOrEqual(2.7);
    }
    expect(chesscomIndustrialCompoundParts([{...buildings[0],w:0}])).toEqual([]);
  });

  it('instances exactly four material/geometry masters and cleans everything up',()=>{
    const disposed=[],instances=[];
    const master=name=>({
      name,position:{set(){}},isPickable:true,
      createInstance(instanceName){
        const obj={name:instanceName,position:{set(){}},scaling:{set(){}},isPickable:true,
          dispose(){disposed.push(instanceName);}};
        instances.push(obj);return obj;
      },dispose(){disposed.push(name);},
    });
    const B={
      Color3:class{static FromHexString(hex){return hex;}},
      StandardMaterial:class{constructor(name){this.name=name;}dispose(){disposed.push(this.name);}},
      MeshBuilder:{CreateBox:name=>master(name)},
    };
    const bb={minimumWorld:{x:-8.965,y:0,z:-6.315},maximumWorld:{x:-4.365,y:2.45,z:-3.915}};
    const scene={getMeshByName:name=>name==='building-OFFICE'?{
      computeWorldMatrix(){},getBoundingInfo:()=>({boundingBox:bb}),
    }:null};
    const host={dataset:{}};
    const layer=installChesscomIndustrialCompoundV27(B,scene,{tier:'balanced',host});
    expect(layer.counts).toEqual({buildings:1,parts:9,templates:4});
    expect(instances).toHaveLength(9);
    expect(instances.every(x=>x.isPickable===false&&x.metadata.decorative)).toBe(true);
    expect(host.dataset.chesscomCompound).toBe('industrial-compound-v27');
    layer.destroy();
    expect(disposed).toHaveLength(17);
    expect(host.dataset.chesscomCompound).toBeUndefined();
  });
});
