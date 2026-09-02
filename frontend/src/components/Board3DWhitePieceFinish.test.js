import { describe, expect, it } from 'vitest';
import { SKIN_3D } from './Board3DConfig.js';
import { makePremiumPieceMaterial } from './Board3DSurfaces.js';
import { reinforcePieceSkinMaterial } from './Board3DSkinDecor.js';

describe('War Room piece finish', () => {
  it('convierte las blancas en marfil tallado claramente pulido sin plástico', () => {
    const skin = SKIN_3D.studio;
    const material = makePremiumPieceMaterial({
      color: skin.white,
      skin,
      side: 'w',
      accent: false,
      coarsePointer: false,
    });

    reinforcePieceSkinMaterial(material, skin.white, 'studio', { accent: false });

    expect(material.userData.surfaceRole).toBe('ivory');
    expect(material.userData.pieceFinish).toBe('polished-carved-ivory-v4');
    expect(material.roughness).toBeGreaterThanOrEqual(0.31);
    expect(material.roughness).toBeLessThanOrEqual(0.4);
    expect(material.metalness).toBeLessThanOrEqual(0.01);
    expect(material.clearcoat).toBeGreaterThanOrEqual(0.4);
    expect(material.clearcoat).toBeLessThanOrEqual(0.48);
    expect(material.clearcoatRoughness).toBeGreaterThanOrEqual(0.2);
    expect(material.clearcoatRoughness).toBeLessThanOrEqual(0.28);
    expect(material.specularIntensity).toBeGreaterThanOrEqual(0.5);
    expect(material.envMapIntensity).toBeGreaterThanOrEqual(0.58);
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
