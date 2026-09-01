import { describe, expect, it } from 'vitest';
import {
  PREMIUM_SURFACE_VERSION,
  createMicroSurfaceMap,
  getCameraFramingProfile,
  makePremiumDecorMaterial,
  makePremiumPieceMaterial,
  makePremiumTileMaterial,
} from './Board3DSurfaces.js';

const skin = {
  metalness: 0.26,
  roughness: 0.48,
  emissive: 0x000000,
  emissiveIntensity: 0,
};

describe('Board3D premium surfaces', () => {
  it('genera microtextura determinista y más ligera para puntero grueso', () => {
    const first = createMicroSurfaceMap({ seed: 77, kind: 'wood' });
    const second = createMicroSurfaceMap({ seed: 77, kind: 'wood' });
    const coarse = createMicroSurfaceMap({ seed: 77, kind: 'wood', coarsePointer: true });

    expect(first.image.width).toBe(32);
    expect(coarse.image.width).toBe(16);
    expect(Array.from(first.image.data.slice(0, 48))).toEqual(Array.from(second.image.data.slice(0, 48)));

    first.dispose();
    second.dispose();
    coarse.dispose();
  });

  it('diferencia marfil, ébano e incrustación sin perder acabado PBR ni quemar las blancas', () => {
    const ivory = makePremiumPieceMaterial({ color: 0xf0eadc, skin, side: 'w' });
    const ebony = makePremiumPieceMaterial({ color: 0x262a30, skin, side: 'b' });
    const accent = makePremiumPieceMaterial({ color: 0xc7a34a, skin, side: 'w', accent: true });

    expect(ivory.userData.surfaceVersion).toBe(PREMIUM_SURFACE_VERSION);
    expect(ivory.userData.surfaceRole).toBe('ivory');
    expect(ebony.userData.surfaceRole).toBe('ebony');
    expect(accent.userData.surfaceRole).toBe('metal-inlay');
    expect(ivory.roughnessMap).toBeTruthy();
    expect(ebony.bumpMap).toBeTruthy();
    expect(accent.roughnessMap).toBeNull();
    expect(accent.clearcoat).toBeGreaterThan(ivory.clearcoat);
    expect(ivory.specularIntensity).toBeLessThan(ebony.specularIntensity);
    expect(ivory.envMapIntensity).toBeLessThan(ebony.envMapIntensity);
    expect(ivory.roughness).toBeGreaterThan(ebony.roughness);

    ivory.roughnessMap.dispose();
    ivory.dispose();
    ebony.roughnessMap.dispose();
    ebony.dispose();
    accent.dispose();
  });

  it('da al tablero veta fina en desktop pero conserva fallback barato en móvil', () => {
    const desktop = makePremiumTileMaterial({ color: 0x5a4236, light: false, seed: 12 });
    const mobile = makePremiumTileMaterial({ color: 0x5a4236, light: false, seed: 12, coarsePointer: true });

    expect(desktop.userData.surfaceRole).toBe('board-dark');
    expect(desktop.roughnessMap).toBeTruthy();
    expect(desktop.bumpScale).toBeGreaterThan(0);
    expect(mobile.roughnessMap).toBeNull();
    expect(mobile.bumpScale).toBe(0);

    desktop.roughnessMap.dispose();
    desktop.dispose();
    mobile.dispose();
  });

  it('separa madera, cuero, tela y metal en perfiles de superficie reales', () => {
    const wood = makePremiumDecorMaterial({ color: 0x5a321c, kind: 'wood', seed: 21 });
    const leather = makePremiumDecorMaterial({ color: 0x2e1015, kind: 'leather', seed: 22 });
    const fabric = makePremiumDecorMaterial({ color: 0x5b2028, kind: 'fabric', seed: 23 });
    const metal = makePremiumDecorMaterial({ color: 0xc5963f, kind: 'metal', seed: 24 });
    const mobileWood = makePremiumDecorMaterial({ color: 0x5a321c, kind: 'wood', seed: 21, coarsePointer: true });

    expect(wood.userData.surfaceRole).toBe('decor-wood');
    expect(leather.userData.surfaceRole).toBe('decor-leather');
    expect(fabric.userData.surfaceRole).toBe('decor-fabric');
    expect(metal.userData.surfaceRole).toBe('decor-metal');
    expect(metal.metalness).toBeGreaterThan(wood.metalness);
    expect(fabric.roughness).toBeGreaterThan(leather.roughness);
    expect(wood.roughnessMap).toBeTruthy();
    expect(mobileWood.roughnessMap).toBeNull();

    for (const material of [wood, leather, fabric, metal]) {
      material.roughnessMap?.dispose();
      material.dispose();
    }
    mobileWood.dispose();
  });
});

describe('Board3D cinematic framing', () => {
  it('usa el espacio lateral extra para acercar la mesa en canvas panorámico', () => {
    const wide = getCameraFramingProfile(1.9);
    const compact = getCameraFramingProfile(1.1);

    expect(wide.halfSpan).toBeLessThan(compact.halfSpan);
    expect(wide.padding).toBeLessThan(compact.padding);
    expect(wide.cameraY).toBeLessThan(compact.cameraY);
    expect(wide.maxDistance).toBeLessThan(compact.maxDistance);
  });
});
