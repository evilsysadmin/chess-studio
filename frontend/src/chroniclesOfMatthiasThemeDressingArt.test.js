import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_TACTICS_THEME_DRESSING_VERSION,
  chroniclesTacticsThemeDressingPlan,
  installChroniclesTacticsThemeDressing,
} from './chroniclesOfMatthiasThemeDressingArt.js';

function fixture(dressing) {
  return {
    mapId: dressing === 'menagerie-ash-v3' ? 'menagerie-of-ash' : 'gallery-of-forks',
    center: { x: 3, y: 3 },
    sceneStyle: {
      dressing,
      palette: {
        metal: 0x855a37,
      },
    },
    wallFaces: [
      { x: 0, y: 2, side: 'east' },
      { x: 0, y: 3, side: 'east' },
      { x: 0, y: 4, side: 'east' },
      { x: 2, y: 0, side: 'south' },
      { x: 3, y: 0, side: 'south' },
      { x: 4, y: 0, side: 'south' },
      { x: 6, y: 2, side: 'west' },
      { x: 6, y: 3, side: 'west' },
      { x: 6, y: 4, side: 'west' },
    ],
  };
}

describe('Chronicles Tactics authored theme dressing', () => {
  it('builds a deterministic Menagerie plan without occupying tactical cells', () => {
    const plan = chroniclesTacticsThemeDressingPlan(fixture('menagerie-ash-v3'));

    expect(plan.version).toBe(CHRONICLES_TACTICS_THEME_DRESSING_VERSION);
    expect(plan.id).toBe('menagerie-ash-v3');
    expect(plan.cages).toHaveLength(3);
    expect(plan.braziers).toHaveLength(4);
    expect(plan.boneBundles).toHaveLength(4);
    expect(plan.banners).toHaveLength(0);
    expect(plan.cages.every((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.z))).toBe(true);
  });

  it('gives Gallery its own fork heraldry instead of sharing Menagerie props', () => {
    const plan = chroniclesTacticsThemeDressingPlan(fixture('gallery-forked-v3'));

    expect(plan.id).toBe('gallery-forked-v3');
    expect(plan.banners).toHaveLength(3);
    expect(plan.braziers).toHaveLength(3);
    expect(plan.reliefs).toHaveLength(3);
    expect(plan.cages).toHaveLength(0);
    expect(plan.boneBundles).toHaveLength(0);
  });

  it('installs theme-specific scene art idempotently', () => {
    const scene = new THREE.Scene();
    const scenePlan = fixture('menagerie-ash-v3');
    const first = installChroniclesTacticsThemeDressing(scene, { coarsePointer: true, scenePlan });
    const second = installChroniclesTacticsThemeDressing(scene, { coarsePointer: true, scenePlan });

    expect(second).toBe(first);
    expect(first.userData.chroniclesThemeDressing).toBe('menagerie-ash-v3');
    expect(first.userData.chroniclesThemePropCount).toBe(11);
    expect(first.getObjectByName('chronicles-theme-menagerie-cage-bars')).toBeTruthy();
    expect(first.getObjectByName('chronicles-theme-menagerie-bone-bundles')).toBeTruthy();
  });

  it('does nothing decorative for neutral scenes', () => {
    const scene = new THREE.Scene();
    const root = installChroniclesTacticsThemeDressing(scene, {
      scenePlan: { center: { x: 0, y: 0 }, sceneStyle: { dressing: 'none', palette: {} }, wallFaces: [] },
    });
    expect(root.userData.chroniclesThemeDressing).toBe('none');
    expect(root.children).toHaveLength(0);
  });
});
