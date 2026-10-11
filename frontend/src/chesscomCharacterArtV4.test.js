import { describe, expect, it } from 'vitest';
import { CHESSCOM_CHARACTER_ART_V4, CHESSCOM_OPERATOR_READABILITY_V22, CHESSCOM_OPERATOR_SILHOUETTE_V23, CHESSCOM_OPERATOR_ANATOMY_V28, CHESSCOM_OPERATOR_CONTOUR_V29, chesscomOperatorContourV29Geometry, chesscomOperatorSilhouetteV23Parts, chesscomCharacterV4Profile, chesscomFieldKitV20Profile } from './chesscomCharacterArtV4.js';

describe('Chesscom character art v4', () => {
  it('declares the custom mesh and procedural PBR contract', () => {
    expect(CHESSCOM_CHARACTER_ART_V4.identity).toBe('character-art-v4');
    expect(CHESSCOM_CHARACTER_ART_V4.renderer).toBe('custom-lowpoly-meshes');
    expect(CHESSCOM_CHARACTER_ART_V4.materials).toBe('procedural-pbr');
  });

  it('keeps Matthias distinct from rifleman, scout and hostile operators', () => {
    const matthias = chesscomCharacterV4Profile('matthias', true);
    const dieter = chesscomCharacterV4Profile('dieter', true);
    const sven = chesscomCharacterV4Profile('sven', true);
    const guard = chesscomCharacterV4Profile('guard-1', false);

    expect(matthias.identity).toBe('matthias-operative-v4');
    expect(matthias.role).toBe('leader');
    expect(dieter.identity).toBe('rifleman-operator-v4');
    expect(sven.identity).toBe('scout-operator-v4');
    expect(sven.compact).toBe(true);
    expect(guard.identity).toBe('hostile-operator-v4');
    expect(guard.friendly).toBe(false);
  });

  it('keeps the authored muzzle endpoint aligned with each weapon silhouette', () => {
    expect(chesscomCharacterV4Profile('matthias', true).muzzleX).toBeGreaterThan(1);
    expect(chesscomCharacterV4Profile('sven', true).muzzleX).toBeLessThan(.9);
    expect(chesscomCharacterV4Profile('dieter', true).muzzleX).toBeCloseTo(.91, 4);
  });
  it('gives each role a recognisable and bounded tactical equipment identity',()=>{
    const scout=chesscomFieldKitV20Profile('scout');
    const rifleman=chesscomFieldKitV20Profile('rifleman');
    const hostile=chesscomFieldKitV20Profile('hostile');
    const leader=chesscomFieldKitV20Profile('leader');
    expect([scout,rifleman,hostile,leader].every(kit=>kit.identity==='field-kit-v20')).toBe(true);
    expect(scout.scarf).toBe(true);
    expect(rifleman.scarf).toBe(false);
    expect(scout.pack).toBeLessThan(rifleman.pack);
    expect(hostile.accent).not.toBe(leader.accent);
    for(const kit of [scout,rifleman,hostile,leader]){
      expect(kit.pack).toBeGreaterThan(0);
      expect(kit.pack).toBeLessThan(.5);
      expect(kit.plates).toBeLessThan(.2);
    }
  });

});

describe('CHESSCOM operator readability v22',()=>{
  const brightness=(hex)=>{
    const digits=hex.slice(1);
    const channels=[0,2,4].map(i=>parseInt(digits.slice(i,i+2),16));
    return channels.reduce((a,c)=>a+c,0)/3;
  };
  it('keeps ally, hostile and Matthias clothing distinguishable in a dark scene',()=>{
    const matthias=chesscomCharacterV4Profile('matthias',true);
    const dieter=chesscomCharacterV4Profile('dieter',true);
    const sven=chesscomCharacterV4Profile('sven',true);
    const guard=chesscomCharacterV4Profile('guard',false);
    expect(CHESSCOM_OPERATOR_READABILITY_V22.identity).toBe('operator-readability-v22');
    expect(brightness(matthias.accent)).toBeGreaterThan(100);
    expect(brightness(sven.cloth)).toBeGreaterThan(brightness(matthias.cloth));
    expect(brightness(dieter.cloth)).toBeGreaterThan(brightness(guard.armour));
    expect(new Set([matthias.accent,dieter.accent,sven.accent,guard.accent]).size).toBe(4);
    for(const profile of [matthias,dieter,sven,guard]){
      expect(brightness(profile.cloth)).toBeGreaterThan(36);
      expect(brightness(profile.armour)).toBeGreaterThan(35);
    }
  });
  it('keeps restrained accent lift below glowing neon levels',()=>{
    expect(CHESSCOM_OPERATOR_READABILITY_V22.accentEmission).toBeGreaterThan(0);
    expect(CHESSCOM_OPERATOR_READABILITY_V22.accentEmission).toBeLessThan(.10);
    expect(CHESSCOM_OPERATOR_READABILITY_V22.faceEmission).toBeLessThan(CHESSCOM_OPERATOR_READABILITY_V22.accentEmission);
  });
});

describe('CHESSCOM operator recognition silhouettes v23',()=>{
  it('keeps high-contrast shape identifiers attached to each role without touching the muzzle',()=>{
    expect(CHESSCOM_OPERATOR_SILHOUETTE_V23.identity).toBe('operator-silhouette-v23');
    const leader=chesscomOperatorSilhouetteV23Parts('leader');
    const scout=chesscomOperatorSilhouetteV23Parts('scout');
    const rifleman=chesscomOperatorSilhouetteV23Parts('rifleman');
    const hostile=chesscomOperatorSilhouetteV23Parts('hostile');
    expect(leader).toHaveLength(3);
    for(const entries of [scout,rifleman,hostile]){
      expect(entries).toHaveLength(5);
      expect(entries.map(x=>x.name)).toContain('helmet-ridge');
    }
    expect(leader.map(x=>x.name)).not.toContain('helmet-ridge');
    expect(scout[0].spec.bw).toBeLessThan(rifleman[0].spec.bw);
    expect(hostile[0].spec.bw).toBeGreaterThan(scout[0].spec.bw);
    for(const entries of [leader,scout,rifleman,hostile]){
      expect(entries.length).toBeLessThanOrEqual(CHESSCOM_OPERATOR_SILHOUETTE_V23.maxPartsPerUnit);
      for(const item of entries){
        expect(['accent','cloth2']).toContain(item.material);
        expect(item.name).not.toMatch(/weapon|muzzle|gun/);
        expect([item.spec.x,item.spec.y,item.spec.z,item.spec.h,item.spec.bw,item.spec.bd].every(Number.isFinite)).toBe(true);
        expect(item.spec.h).toBeGreaterThan(0);
        expect(Math.abs(item.spec.x)).toBeLessThan(.55);
        expect(item.spec.y).toBeGreaterThan(.90);
        expect(item.spec.y).toBeLessThan(1.56);
      }
    }
  });
});

describe('CHESSCOM human silhouette and kit V28',()=>{
  it('keeps helmets, boots and heads in restrained non-toy proportions',()=>{
    expect(CHESSCOM_OPERATOR_ANATOMY_V28.identity).toBe('operator-anatomy-v28');
    expect(CHESSCOM_OPERATOR_ANATOMY_V28.helmetWidth).toBeLessThan(.37);
    expect(CHESSCOM_OPERATOR_ANATOMY_V28.headWidth).toBeLessThan(.17);
    expect(CHESSCOM_OPERATOR_ANATOMY_V28.bootDepth).toBeLessThan(.26);
    expect(CHESSCOM_OPERATOR_ANATOMY_V28.helmetHeight).toBeLessThan(.18);
    expect(CHESSCOM_OPERATOR_ANATOMY_V28.emphasis).toBe('human-tapered-lowpoly');
    // Role-specific silhouette stays functional even with less shoulder bulk.
    const scout=chesscomOperatorSilhouetteV23Parts('scout');
    const rifleman=chesscomOperatorSilhouetteV23Parts('rifleman');
    const hostile=chesscomOperatorSilhouetteV23Parts('hostile');
    expect(scout[0].spec.bw).toBeLessThan(rifleman[0].spec.bw);
    expect(rifleman[0].spec.bw).toBeLessThan(hostile[0].spec.bw);
  });
});

describe('CHESSCOM premium contoured operators V29',()=>{
  it('creates a closed, finite, outward-facing 8-sided tailored surface with no extra meshes',()=>{
    const shape=chesscomOperatorContourV29Geometry({h:.69,bw:.35,bd:.27,tw:.47,td:.29});
    expect(CHESSCOM_OPERATOR_CONTOUR_V29.identity).toBe('operator-contour-v29');
    expect(shape.positions).toHaveLength(24*3);
    expect(shape.uvs).toHaveLength(24*2);
    expect(shape.indices).toHaveLength(132);
    expect(Math.max(...shape.indices)).toBeLessThan(24);
    expect(shape.positions.every(Number.isFinite)).toBe(true);
    expect(shape.uvs.every(Number.isFinite)).toBe(true);
    // Shoulders are wider than the waist; intermediate contours remain bounded.
    const width=(ring)=>Math.max(...shape.positions.slice(ring*24,ring*24+24).filter((_,i)=>i%3===0))
      -Math.min(...shape.positions.slice(ring*24,ring*24+24).filter((_,i)=>i%3===0));
    expect(width(2)).toBeGreaterThan(width(0));
    expect(width(1)).toBeLessThan(.6);
    // Top and bottom cap normals face outward, not inside the body.
    const triangleY=(offset)=>{
      const [a,b,c]=shape.indices.slice(offset,offset+3).map(i=>shape.positions.slice(i*3,i*3+3));
      const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
      return u[2]*v[0]-u[0]*v[2];
    };
    expect(triangleY(0)).toBeLessThan(0);
    expect(triangleY(3)).toBeGreaterThan(0);
  });
  it('rejects degenerate or non-finite contours rather than sending corrupt data to Babylon',()=>{
    expect(()=>chesscomOperatorContourV29Geometry({h:0,bw:.3,bd:.3,tw:.4,td:.3})).toThrow(RangeError);
    expect(()=>chesscomOperatorContourV29Geometry({h:.6,bw:Infinity,bd:.3,tw:.4,td:.3})).toThrow(RangeError);
    expect(()=>chesscomOperatorContourV29Geometry({h:.6,bw:.3,bd:.3,tw:.4,td:.3,middleScale:1.4})).toThrow(RangeError);
  });
});
