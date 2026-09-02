import { describe, expect, it } from 'vitest';
import { SKIN_3D } from './Board3DConfig.js';
import { makePremiumPieceMaterial } from './Board3DSurfaces.js';
import { reinforcePieceSkinMaterial } from './Board3DSkinDecor.js';

describe('War Room white piece finish', () => {
  it('preserva un marfil mate aunque el skin refuerce su identidad', () => {
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
    expect(material.roughness).toBeGreaterThanOrEqual(0.86);
    expect(material.metalness).toBeLessThanOrEqual(0.01);
    expect(material.clearcoat).toBeLessThanOrEqual(0.055);
    expect(material.clearcoatRoughness).toBeGreaterThanOrEqual(0.72);
    expect(material.specularIntensity).toBeLessThanOrEqual(0.1);
    expect(material.envMapIntensity).toBeLessThanOrEqual(0.11);
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
