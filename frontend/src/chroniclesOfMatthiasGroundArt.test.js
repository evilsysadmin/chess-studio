import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_TACTICS_WET_PATCHES,
  CHRONICLES_TACTICS_WET_STONE_STYLE,
  installChroniclesTacticsWetStone,
} from './chroniclesOfMatthiasGroundArt.js';

describe('Chronicles Tactics wet stone art', () => {
  it('keeps the wet-stone overlay restrained and bounded', () => {
    expect(CHRONICLES_TACTICS_WET_STONE_STYLE).toMatchObject({
      motif: 'wet-stone',
      desktopPatchCount: 8,
      coarsePatchCount: 4,
    });
    expect(CHRONICLES_TACTICS_WET_PATCHES).toHaveLength(8);
    CHRONICLES_TACTICS_WET_PATCHES.forEach((patch) => {
      expect(Math.abs(patch.x)).toBeLessThan(6);
      expect(Math.abs(patch.z)).toBeLessThan(5);
      expect(patch.sx).toBeLessThanOrEqual(1.3);
      expect(patch.sz).toBeLessThanOrEqual(0.5);
    });
  });

  it('installs eight thin non-interactive sheen patches on desktop', () => {
    const scene = new THREE.Scene();
    const first = installChroniclesTacticsWetStone(scene, { coarsePointer: false });
    const second = installChroniclesTacticsWetStone(scene, { coarsePointer: false });

    expect(first?.name).toBe('chronicles-wet-stone');
    expect(second).toBe(first);
    expect(first?.children).toHaveLength(8);
    expect(scene.getObjectByName('chronicles-wet-stone-patch-7')).toBeTruthy();
    expect(scene.children.filter((child) => child.name === 'chronicles-wet-stone')).toHaveLength(1);
    first?.children.forEach((patch) => {
      expect(patch.userData.chroniclesIsoCell).toBeUndefined();
      expect(patch.userData.chroniclesIsoEnemyId).toBeUndefined();
      expect(patch.position.y).toBeLessThan(0.02);
      expect(patch.renderOrder).toBe(2);
    });
  });

  it('halves patch count and opacity for coarse pointers', () => {
    const scene = new THREE.Scene();
    const root = installChroniclesTacticsWetStone(scene, { coarsePointer: true });

    expect(root?.children).toHaveLength(4);
    const material = root?.children[0]?.material;
    expect(material?.opacity).toBe(CHRONICLES_TACTICS_WET_STONE_STYLE.coarseOpacity);
    expect(material?.roughness).toBeGreaterThan(0.2);
  });

  it('fails closed without a scene', () => {
    expect(installChroniclesTacticsWetStone(null)).toBeNull();
  });
});
