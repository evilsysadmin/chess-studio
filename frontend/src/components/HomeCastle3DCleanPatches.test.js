import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  HOME_CASTLE_CLEAN_PATCH_PLAN,
  createHomeCastleCleanPatchLayer,
} from './HomeCastle3DCleanPatches.js';

function firstPatch(layer) {
  return layer.group.children[0];
}

describe('HomeCastle3D clean patches', () => {
  it('starts with one deliberately small tournament pilot patch', () => {
    expect(HOME_CASTLE_CLEAN_PATCH_PLAN).toHaveLength(1);
    expect(HOME_CASTLE_CLEAN_PATCH_PLAN[0].id).toBe('tournament');
    expect(HOME_CASTLE_CLEAN_PATCH_PLAN[0].size.width).toBeLessThan(0.25);
    expect(HOME_CASTLE_CLEAN_PATCH_PLAN[0].size.height).toBeLessThan(0.2);
  });

  it('renders the clone-blended clean patch between the hall art and 3D props', () => {
    const layer = createHomeCastleCleanPatchLayer();
    const patch = firstPatch(layer);

    expect(layer.group.name).toBe('home-castle-clean-patches');
    expect(patch.name).toBe('home-castle-clean-patch-tournament');
    expect(patch.renderOrder).toBeGreaterThan(0);
    expect(patch.renderOrder).toBeLessThan(1);
    expect(patch.material.transparent).toBe(true);
    expect(patch.material.depthWrite).toBe(false);
    expect(patch.material.depthTest).toBe(false);
    expect(patch.material.fragmentShader).toContain('fromLeft');
    expect(patch.material.fragmentShader).toContain('fromRight');
    expect(patch.geometry.getAttribute('patchUv')).toBeTruthy();

    layer.dispose();
  });

  it('warps the patch with the hall surface instead of leaving it as a flat DOM-like card', () => {
    const layer = createHomeCastleCleanPatchLayer();
    const positions = firstPatch(layer).geometry.getAttribute('position');
    const zValues = [];
    for (let index = 0; index < positions.count; index += 1) zValues.push(positions.getZ(index));

    expect(Math.max(...zValues) - Math.min(...zValues)).toBeGreaterThan(0);
    layer.dispose();
  });

  it('borrows the already-loaded hall texture without taking ownership of it', () => {
    const texture = new THREE.Texture();
    const disposeTexture = vi.spyOn(texture, 'dispose');
    const layer = createHomeCastleCleanPatchLayer();
    const patch = firstPatch(layer);

    layer.setTexture(texture);
    expect(patch.material.uniforms.map.value).toBe(texture);
    layer.dispose();
    expect(disposeTexture).not.toHaveBeenCalled();

    texture.dispose();
  });
});
