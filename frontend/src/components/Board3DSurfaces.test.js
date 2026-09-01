import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PREMIUM_SURFACE_VERSION,
  applyPremiumDecorSurfacePass,
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

function disposeMaterial(material) {
  const textures = new Set();
  for (const value of Object.values(material || {})) {
    if (!value?.isTexture || textures.has(value)) continue;
    textures.add(value);
    value.dispose();
  }
  material?.dispose?.();
}

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
    const ivoryHsl = {};
    ivory.color.getHSL(ivoryHsl);

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
    expect(ivory.roughness).toBeGreaterThanOrEqual(0.68);
    expect(ivory.metalness).toBeLessThan(0.03);
    expect(ivory.specularIntensity).toBeLessThanOrEqual(0.25);
    expect(ivory.envMapIntensity).toBeLessThan(0.3);
    expect(ivory.clearcoat).toBeLessThanOrEqual(0.22);
    expect(ivoryHsl.l).toBeLessThan(0.82);

    disposeMaterial(ivory);
    disposeMaterial(ebony);
    disposeMaterial(accent);
  });

  it('da al tablero veta fina en desktop pero conserva fallback barato en móvil', () => {
    const desktop = makePremiumTileMaterial({ color: 0x5a4236, light: false, seed: 12 });
    const mobile = makePremiumTileMaterial({ color: 0x5a4236, light: false, seed: 12, coarsePointer: true });

    expect(desktop.userData.surfaceRole).toBe('board-dark');
    expect(desktop.roughnessMap).toBeTruthy();
    expect(desktop.bumpScale).toBeGreaterThan(0);
    expect(desktop.roughness).toBeGreaterThanOrEqual(0.68);
    expect(desktop.clearcoat).toBeLessThanOrEqual(0.24);
    expect(desktop.envMapIntensity).toBeLessThanOrEqual(0.52);
    expect(mobile.roughnessMap).toBeNull();
    expect(mobile.bumpScale).toBe(0);

    disposeMaterial(desktop);
    disposeMaterial(mobile);
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
    expect(wood.roughness).toBeGreaterThanOrEqual(0.5);
    expect(wood.clearcoat).toBeLessThanOrEqual(0.34);
    expect(wood.envMapIntensity).toBeLessThanOrEqual(0.7);
    expect(wood.specularIntensity).toBeLessThanOrEqual(0.6);
    expect(mobileWood.roughnessMap).toBeNull();

    for (const material of [wood, leather, fabric, metal, mobileWood]) disposeMaterial(material);
  });

  it('aplica las superficies al decorado existente sin pisar piezas ni casillas premium', () => {
    const scene = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const wood = new THREE.MeshPhysicalMaterial({ color: 0x5a321c, metalness: 0.03, roughness: 0.48, clearcoat: 0.56, envMapIntensity: 1, specularIntensity: 1 });
    const leather = new THREE.MeshPhysicalMaterial({ color: 0x2e1015, metalness: 0.01, roughness: 0.46, sheen: 0.38 });
    const fabric = new THREE.MeshPhysicalMaterial({ color: 0x5b2028, metalness: 0, roughness: 0.9, sheen: 0.45 });
    const brass = new THREE.MeshPhysicalMaterial({ color: 0xc5963f, metalness: 0.88, roughness: 0.2 });
    const ivory = makePremiumPieceMaterial({ color: 0xf0eadc, skin, side: 'w' });
    const originalIvoryMap = ivory.roughnessMap;

    for (const material of [wood, leather, fabric, brass, ivory]) scene.add(new THREE.Mesh(geometry, material));
    const stats = applyPremiumDecorSurfacePass(scene);

    expect(stats).toMatchObject({ wood: 1, leather: 1, fabric: 1, metal: 1, total: 4 });
    expect(wood.userData.surfaceRole).toBe('decor-wood');
    expect(leather.userData.surfaceRole).toBe('decor-leather');
    expect(fabric.userData.surfaceRole).toBe('decor-fabric');
    expect(brass.userData.surfaceRole).toBe('decor-metal');
    expect(wood.roughnessMap).toBeTruthy();
    expect(wood.clearcoat).toBeLessThanOrEqual(0.34);
    expect(wood.envMapIntensity).toBeLessThanOrEqual(0.66);
    expect(wood.specularIntensity).toBeLessThanOrEqual(0.58);
    expect(fabric.bumpMap).toBeTruthy();
    expect(brass.bumpScale).toBeLessThan(wood.bumpScale);
    expect(ivory.userData.surfaceRole).toBe('ivory');
    expect(ivory.roughnessMap).toBe(originalIvoryMap);
    expect(scene.userData.premiumDecorSurfacePass).toBe(PREMIUM_SURFACE_VERSION);

    geometry.dispose();
    for (const material of [wood, leather, fabric, brass, ivory]) disposeMaterial(material);
  });

  it('en coarse pointer conserva el perfil material pero no crea microtexturas', () => {
    const scene = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const wood = new THREE.MeshPhysicalMaterial({ color: 0x3a2114, metalness: 0.02, roughness: 0.5 });
    scene.add(new THREE.Mesh(geometry, wood));

    const stats = applyPremiumDecorSurfacePass(scene, { coarsePointer: true });
    expect(stats.wood).toBe(1);
    expect(wood.userData.surfaceRole).toBe('decor-wood');
    expect(wood.roughnessMap).toBeNull();
    expect(wood.bumpMap).toBeNull();

    geometry.dispose();
    disposeMaterial(wood);
  });
});

describe('Board3D cinematic framing', () => {
  it('usa el espacio lateral extra para acercar la mesa sin amputar el borde del jugador', () => {
    const wide = getCameraFramingProfile(1.9);
    const compact = getCameraFramingProfile(1.1);

    expect(wide.halfSpan).toBeLessThan(compact.halfSpan);
    expect(wide.padding).toBeLessThan(compact.padding);
    expect(wide.cameraY).toBeLessThan(compact.cameraY);
    expect(wide.maxDistance).toBeLessThan(compact.maxDistance);
    expect(wide.targetZ).toBeLessThan(0);
    expect(compact.targetZ).toBeLessThanOrEqual(0);
  });
});
