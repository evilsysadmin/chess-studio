import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyPremiumDecorSurfacePass,
  getCameraFramingProfile,
  makePremiumPieceMaterial,
} from './Board3DSurfaces.js';

const skin = {
  metalness: 0.26,
  roughness: 0.48,
  emissive: 0x000000,
  emissiveIntensity: 0,
};

function disposeMaterial(material) {
  const textures = new Set([material?.roughnessMap, material?.bumpMap].filter(Boolean));
  for (const texture of textures) texture.dispose();
  material?.dispose?.();
}

describe('Board3D reference look', () => {
  it('mantiene las blancas en marfil mate y lejos del blanco quemado', () => {
    const ivory = makePremiumPieceMaterial({ color: 0xf0eadc, skin, side: 'w' });
    const hsl = {};
    ivory.color.getHSL(hsl);

    expect(hsl.l).toBeLessThan(0.7);
    expect(ivory.roughness).toBeGreaterThanOrEqual(0.78);
    expect(ivory.clearcoat).toBeLessThanOrEqual(0.1);
    expect(ivory.specularIntensity).toBeLessThanOrEqual(0.12);
    expect(ivory.envMapIntensity).toBeLessThanOrEqual(0.15);

    disposeMaterial(ivory);
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
});
