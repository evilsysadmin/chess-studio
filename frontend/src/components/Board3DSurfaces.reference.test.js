import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyPremiumDecorSurfacePass,
  getCameraFramingProfile,
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
  const textures = new Set([material?.map, material?.roughnessMap, material?.bumpMap].filter(Boolean));
  for (const texture of textures) texture.dispose();
  material?.dispose?.();
}

describe('Board3D reference look', () => {
  it('mantiene las blancas en marfil cálido satinado y lejos del blanco quemado', () => {
    const ivory = makePremiumPieceMaterial({ color: 0xf0eadc, skin, side: 'w' });
    const hsl = {};
    ivory.color.getHSL(hsl);

    expect(hsl.l).toBeLessThan(0.72);
    expect(ivory.roughness).toBeGreaterThanOrEqual(0.68);
    expect(ivory.roughness).toBeLessThanOrEqual(0.86);
    expect(ivory.clearcoat).toBeGreaterThanOrEqual(0.16);
    expect(ivory.clearcoat).toBeLessThanOrEqual(0.22);
    expect(ivory.specularIntensity).toBeGreaterThanOrEqual(0.2);
    expect(ivory.specularIntensity).toBeLessThanOrEqual(0.26);
    expect(ivory.envMapIntensity).toBe(0);

    disposeMaterial(ivory);
  });

  it('mantiene la casilla clara mate estable cuando entra el IBL diferido', () => {
    const light = makePremiumTileMaterial({ color: 0xd9cfba, light: true, coarsePointer: false });
    const dark = makePremiumTileMaterial({ color: 0x76513f, light: false, coarsePointer: false });

    expect(light.userData.surfaceRole).toBe('board-light');
    // A tiny IBL contribution is intentional now that the limestone albedo has
    // visible meso-detail. Keep it tightly capped so the light squares stay matte.
    expect(light.envMapIntensity).toBeGreaterThanOrEqual(0);
    expect(light.envMapIntensity).toBeLessThanOrEqual(0.03);
    expect(dark.envMapIntensity).toBeGreaterThan(light.envMapIntensity);

    disposeMaterial(light);
    disposeMaterial(dark);
  });

  it('oscurece y mata el barniz de los muebles existentes', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const wood = new THREE.MeshPhysicalMaterial({
      color: 0x5a321c,
      metalness: 0.03,
      roughness: 0.46,
      clearcoat: 0.5,
      envMapIntensity: 1,
      specularIntensity: 1,
    });
    const before = wood.color.getHex();
    root.add(new THREE.Mesh(geometry, wood));

    applyPremiumDecorSurfacePass(root);

    expect(wood.color.getHex()).not.toBe(before);
    expect(wood.roughness).toBeGreaterThanOrEqual(0.62);
    expect(wood.clearcoat).toBeLessThanOrEqual(0.16);
    expect(wood.envMapIntensity).toBeLessThanOrEqual(0.38);
    expect(wood.specularIntensity).toBeLessThanOrEqual(0.34);

    disposeMaterial(wood);
    geometry.dispose();
  });

  it('abre el plano para enseñar la sala sin perder el borde cercano del tablero', () => {
    const wide = getCameraFramingProfile(1.9);
    expect(wide.halfSpan).toBeGreaterThan(5.2);
    expect(wide.targetY).toBeGreaterThan(1);
    expect(wide.targetZ).toBeLessThan(0);
    expect(wide.minDistance).toBeGreaterThanOrEqual(13);
  });

  it('da a v3 un encuadre de observatorio más abierto sin cambiar v1/v2', () => {
    const canonical = getCameraFramingProfile(1.9);
    const observatory = getCameraFramingProfile(1.9, { variant: 'v3' });
    const compactObservatory = getCameraFramingProfile(1.2, { variant: 'v3' });

    expect(observatory.version).toBe('v3-observatory-open-v1');
    expect(observatory.halfSpan).toBeGreaterThan(canonical.halfSpan + 0.6);
    expect(observatory.targetY).toBeGreaterThan(canonical.targetY);
    expect(compactObservatory.halfSpan).toBeGreaterThan(6.4);
  });
});