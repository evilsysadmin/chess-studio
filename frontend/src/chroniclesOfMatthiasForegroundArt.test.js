import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_TACTICS_FOREGROUND_PLAN,
  CHRONICLES_TACTICS_FOREGROUND_STYLE,
  chroniclesTacticsForegroundZForScenePlan,
  installChroniclesTacticsForegroundFraming,
} from './chroniclesOfMatthiasForegroundArt.js';

describe('Chronicles Tactics canonical foreground framing', () => {
  it('keeps framing outside the playable centre', () => {
    expect(CHRONICLES_TACTICS_FOREGROUND_STYLE).toMatchObject({
      motif: 'stone-guardians',
      guardianCount: 2,
      brazierCount: 2,
      parapetCount: 4,
    });
    expect(CHRONICLES_TACTICS_FOREGROUND_PLAN.guardians).toHaveLength(2);
    expect(CHRONICLES_TACTICS_FOREGROUND_PLAN.braziers).toHaveLength(2);
    CHRONICLES_TACTICS_FOREGROUND_PLAN.guardians.forEach((guardian) => {
      expect(Math.abs(guardian.x)).toBeGreaterThan(8);
      expect(guardian.z).toBeGreaterThan(6);
    });
  });

  it('builds non-interactive guardian, parapet and brazier silhouettes once', () => {
    const scene = new THREE.Scene();
    const first = installChroniclesTacticsForegroundFraming(scene, { coarsePointer: false });
    const second = installChroniclesTacticsForegroundFraming(scene, { coarsePointer: false });

    expect(first?.name).toBe('chronicles-foreground-framing');
    expect(second).toBe(first);
    expect(scene.getObjectByName('chronicles-foreground-guardian-0')).toBeTruthy();
    expect(scene.getObjectByName('chronicles-foreground-guardian-1')).toBeTruthy();
    expect(scene.getObjectByName('chronicles-foreground-parapet-3')).toBeTruthy();
    expect(scene.getObjectByName('chronicles-foreground-brazier-0')).toBeTruthy();
    expect(scene.getObjectByName('chronicles-foreground-brazier-1')).toBeTruthy();
    expect(scene.getObjectByName('chronicles-foreground-brazier-light-0')).toBeTruthy();
    expect(scene.children.filter((child) => child.name === 'chronicles-foreground-framing')).toHaveLength(1);
  });

  it('moves the foreground framing with the south edge on large maps', () => {
    const scene = new THREE.Scene();
    const scenePlan = { width: 11, height: 11 };
    const framing = installChroniclesTacticsForegroundFraming(scene, {
      coarsePointer: true,
      scenePlan,
    });

    expect(chroniclesTacticsForegroundZForScenePlan(scenePlan)).toBeCloseTo(4.9, 6);
    expect(framing?.position.z).toBeCloseTo(4.9, 6);
    expect(scene.getObjectByName('chronicles-foreground-guardian-0').getWorldPosition(new THREE.Vector3()).z)
      .toBeGreaterThan(11);
  });

  it('keeps coarse rendering lighter by omitting point lights', () => {
    const scene = new THREE.Scene();
    installChroniclesTacticsForegroundFraming(scene, { coarsePointer: true });

    expect(scene.getObjectByName('chronicles-foreground-brazier-flame-0')).toBeTruthy();
    expect(scene.getObjectByName('chronicles-foreground-brazier-light-0')).toBeFalsy();
  });

  it('fails closed without a scene', () => {
    expect(installChroniclesTacticsForegroundFraming(null)).toBeNull();
  });
});
