import { describe, expect, it } from 'vitest';
import { CHESSCOM_CHARACTER_ART_V4, CHESSCOM_OPERATOR_READABILITY_V22, chesscomCharacterV4Profile, chesscomFieldKitV20Profile } from './chesscomCharacterArtV4.js';

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
