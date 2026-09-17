import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  HOME_CASTLE_FOREGROUND_ALPHA_TEST,
  HOME_CASTLE_FOREGROUND_RENDER_ORDER,
  createHomeCastleForegroundLayer,
  homeCastleCompositionReady,
  prepareHomeCastleSceneTexture,
} from './HomeCastle3DCompositor.js';
import {
  HOME_CASTLE_ORIGINAL_UV_ATTRIBUTE,
  applyHomeCastleBackgroundCleanPatches,
} from './HomeCastle3DCleanPatches.js';
import { createCanonicalHallGeometry } from './HomeCastle3DGeometry.js';

describe('HomeCastle3DCompositor', () => {
  it('keeps the legacy single-layer scene ready as soon as the background exists', () => {
    expect(homeCastleCompositionReady({ backgroundReady: true })).toBe(true);
    expect(homeCastleCompositionReady({ backgroundReady: false })).toBe(false);
  });

  it('does not reveal a layered clean plate before the foreground matte is ready', () => {
    expect(homeCastleCompositionReady({
      backgroundReady: true,
      foregroundRequired: true,
      foregroundReady: false,
    })).toBe(false);
    expect(homeCastleCompositionReady({
      backgroundReady: true,
      foregroundRequired: true,
      foregroundReady: true,
    })).toBe(true);
  });

  it('normalizes scene textures for canonical colour and interpolation', () => {
    const texture = new THREE.Texture();

    expect(prepareHomeCastleSceneTexture(texture)).toBe(texture);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.minFilter).toBe(THREE.LinearFilter);
    expect(texture.magFilter).toBe(THREE.LinearFilter);

    texture.dispose();
  });

  it('creates an alpha foreground that renders after props without owning shared geometry', () => {
    const geometry = new THREE.PlaneGeometry(2, 1);
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const layer = createHomeCastleForegroundLayer(geometry);
    const texture = new THREE.Texture();
    const textureDispose = vi.spyOn(texture, 'dispose');

    expect(layer.mesh.geometry).toBe(geometry);
    expect(layer.mesh.visible).toBe(false);
    expect(layer.mesh.renderOrder).toBe(HOME_CASTLE_FOREGROUND_RENDER_ORDER);
    expect(layer.material.transparent).toBe(true);
    expect(layer.material.alphaTest).toBe(HOME_CASTLE_FOREGROUND_ALPHA_TEST);
    expect(layer.material.depthTest).toBe(false);
    expect(layer.material.depthWrite).toBe(false);

    layer.setTexture(texture);
    expect(layer.mesh.visible).toBe(true);
    expect(layer.material.map).toBe(texture);

    layer.dispose();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).not.toHaveBeenCalled();
    geometry.dispose();
  });

  it('uses untouched canonical UVs for a future foreground over a cleaned background', () => {
    const geometry = createCanonicalHallGeometry({ widthSegments: 64, heightSegments: 36 });
    const canonicalUv = Array.from(geometry.getAttribute('uv').array);
    applyHomeCastleBackgroundCleanPatches(geometry);
    const patchedUv = Array.from(geometry.getAttribute('uv').array);
    expect(patchedUv).not.toEqual(canonicalUv);
    expect(geometry.getAttribute(HOME_CASTLE_ORIGINAL_UV_ATTRIBUTE)).toBeTruthy();

    const layer = createHomeCastleForegroundLayer(geometry);
    const ownedGeometryDispose = vi.spyOn(layer.mesh.geometry, 'dispose');

    expect(layer.mesh.geometry).not.toBe(geometry);
    expect(Array.from(layer.mesh.geometry.getAttribute('uv').array)).toEqual(canonicalUv);
    expect(layer.mesh.geometry.getAttribute(HOME_CASTLE_ORIGINAL_UV_ATTRIBUTE)).toBeUndefined();

    layer.dispose();
    expect(ownedGeometryDispose).toHaveBeenCalledOnce();
    geometry.dispose();
  });
});
