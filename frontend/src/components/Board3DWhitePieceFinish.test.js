import { describe, expect, it } from 'vitest';
import { SKIN_3D } from './Board3DConfig.js';
import { makePremiumPieceMaterial } from './Board3DSurfaces.js';
import { reinforcePieceSkinMaterial } from './Board3DSkinDecor.js';

describe('War Room piece finish', () => {
  it('preserva el marfil canónico de Board3DSurfaces al aplicar la identidad de skin', () => {
    const skin = SKIN_3D.studio;
    const material = makePremiumPieceMaterial({
      color: skin.white,
      skin,
      side: 'w',
      accent: false,
      coarsePointer: false,
    });
    const before = {
      color: material.color.getHex(),
      metalness: material.metalness,
      roughness: material.roughness,
      clearcoat: material.clearcoat,
      clearcoatRoughness: material.clearcoatRoughness,
      specularIntensity: material.specularIntensity,
      envMapIntensity: material.envMapIntensity,
      sheen: material.sheen,
      sheenRoughness: material.sheenRoughness,
    };

    reinforcePieceSkinMaterial(material, skin.white, 'studio', { accent: false });

    expect(material.userData.surfaceRole).toBe('ivory');
    expect(material.userData.pieceFinish).toBe('canonical-satin-ivory-v5');
    expect(material.userData.skinMaterialAuthority).toBe('Board3DSurfaces');
    expect({
      color: material.color.getHex(),
      metalness: material.metalness,
      roughness: material.roughness,
      clearcoat: material.clearcoat,
      clearcoatRoughness: material.clearcoatRoughness,
      specularIntensity: material.specularIntensity,
      envMapIntensity: material.envMapIntensity,
      sheen: material.sheen,
      sheenRoughness: material.sheenRoughness,
    }).toEqual(before);
    expect(material.roughness).toBeGreaterThanOrEqual(0.7);
    expect(material.clearcoat).toBeCloseTo(0.2, 6);
    expect(material.specularIntensity).toBeCloseTo(0.24, 6);
    expect(material.envMapIntensity).toBeCloseTo(0.28, 6);
  });

  it('da profundidad lacada visible a las negras clásicas sin pisar skins muy metálicos', () => {
    const skin = SKIN_3D.studio;
    const material = makePremiumPieceMaterial({
      color: skin.black,
      skin,
      side: 'b',
      accent: false,
      coarsePointer: false,
    });

    reinforcePieceSkinMaterial(material, skin.black, 'studio', { accent: false });

    expect(material.userData.surfaceRole).toBe('ebony');
    expect(material.userData.pieceFinish).toBe('polished-ebony-lacquer-v4');
    expect(material.roughness).toBeGreaterThanOrEqual(0.22);
    expect(material.roughness).toBeLessThanOrEqual(0.33);
    expect(material.clearcoat).toBeGreaterThanOrEqual(0.78);
    expect(material.clearcoatRoughness).toBeLessThanOrEqual(0.17);
    expect(material.specularIntensity).toBeGreaterThanOrEqual(0.9);
    expect(material.envMapIntensity).toBeGreaterThanOrEqual(0.96);
  });

  it('no apaga las incrustaciones metálicas blancas', () => {
    const skin = SKIN_3D.studio;
    const accent = makePremiumPieceMaterial({
      color: skin.whiteAccent,
      skin,
      side: 'w',
      accent: true,
      coarsePointer: false,
    });

    reinforcePieceSkinMaterial(accent, skin.whiteAccent, 'studio', { accent: true });

    expect(accent.userData.surfaceRole).toBe('metal-inlay');
    expect(accent.metalness).toBeGreaterThan(0.1);
    expect(accent.roughness).toBeLessThan(0.8);
  });
});
