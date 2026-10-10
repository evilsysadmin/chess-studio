import { describe, expect, it } from 'vitest';
import { CHESSCOM_TRUCK_ART_V21, CHESSCOM_TRUCK_DETAIL_V22, chesscomTruckV22DetailParts, chesscomTruckV21Parts, createChesscomTruckV21 } from './chesscomTruckArtV21.js';

describe('CHESSCOM Kharif Outpost six-wheel transport',()=>{
  it('builds a legible 6x6 cab, roof and cargo silhouette with budgeted details',()=>{
    const low=chesscomTruckV21Parts('balanced');
    const high=chesscomTruckV21Parts('high');
    const full=chesscomTruckV21Parts('ultra');
    expect(low.length).toBeGreaterThan(30);
    expect(low.length).toBeLessThan(high.length);
    expect(high.length).toBeLessThan(full.length);
    expect(CHESSCOM_TRUCK_ART_V21.axles).toHaveLength(3);
    const wheels=full.filter(p=>p.kind==='wheel');
    expect(wheels.filter(p=>p.name.startsWith('tyre-'))).toHaveLength(6);
    expect(wheels.filter(p=>p.name.startsWith('hub-'))).toHaveLength(6);
    expect(full.map(p=>p.name)).toContain('windshield');
    expect(full.map(p=>p.name)).toContain('canvas-roof');
    expect(full.map(p=>p.name)).toContain('radiator-grille');
    for(const part of full){
      expect([part.x,part.y,part.z].every(Number.isFinite)).toBe(true);
      expect(part.kind==='box' ? Math.min(part.w,part.h,part.d)>0 : part.diameter>0 && part.thickness>0).toBe(true);
    }
  });

  it('adds physically attached V22 field details with a strict GPU tier budget',()=>{
    const balanced=chesscomTruckV22DetailParts('balanced');
    const high=chesscomTruckV22DetailParts('high');
    const ultra=chesscomTruckV22DetailParts('ultra');
    expect(CHESSCOM_TRUCK_DETAIL_V22.noPicking).toBe(true);
    expect(balanced.length).toBeLessThan(high.length);
    expect(high.length).toBeLessThan(ultra.length);
    expect(ultra.length).toBeLessThanOrEqual(CHESSCOM_TRUCK_DETAIL_V22.maxAdditionalParts);
    expect(ultra.map(p=>p.name)).toContain('spare-wheel');
    expect(ultra.filter(p=>p.name.startsWith('fender-'))).toHaveLength(6);
    expect(ultra.filter(p=>p.name.startsWith('canopy-seam-'))).toHaveLength(3);
    for(const part of ultra) {
      expect([part.x,part.y,part.z].every(Number.isFinite)).toBe(true);
      expect(part.kind==='box'
        ? [part.w,part.h,part.d].every(v=>v>0)
        : part.diameter>0 && part.thickness>0).toBe(true);
    }
    expect(chesscomTruckV21Parts('ultra').map(p=>p.name)).toContain('spare-wheel');
  });

  it('keeps every mesh decorative and reuses a single yaw-correct vehicle pivot',()=>{
    const meshes=[];const shadows=[];
    class Mesh{
      constructor(name){this.name=name;this.rotation={x:0,y:0,z:0};this.position={set(x,y,z){this.x=x;this.y=y;this.z=z;}};meshes.push(this);}
    }
    const B={
      TransformNode:Mesh,
      MeshBuilder:{
        CreateBox:(name)=>new Mesh(name),
        CreateCylinder:(name)=>new Mesh(name),
      },
    };
    const mats={
      truck:{},truckCanvas:{},metalBright:{},metalDark:{},window:{},
      headlight:{},tire:{},barrel:{},
    };
    const root=createChesscomTruckV21(B,{},{
      x:6.975,z:-2.325,mats,shadowGenerator:{addShadowCaster(m){shadows.push(m);}},tier:'balanced',
    });
    expect(root.name).toBe('truck-v21-root');
    expect(root.rotation.y).toBeCloseTo(.18);
    expect(root.metadata.detail).toBe('truck-field-details-v22');
    const children=meshes.filter(m=>m!==root);
    expect(children).toHaveLength(chesscomTruckV21Parts('balanced').length);
    expect(children.every(m=>m.parent===root && m.isPickable===false && m.metadata.decorative===true)).toBe(true);
    expect(shadows.length).toBeGreaterThan(2);
    expect(shadows.length).toBeLessThan(10);
    expect(children.filter(m=>m.name.includes('tyre-'))).toHaveLength(6);
    expect(children.filter(m=>m.name.includes('tyre-')).every(m=>m.rotation.x===Math.PI/2)).toBe(true);
  });
});
