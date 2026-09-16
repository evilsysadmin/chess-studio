import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_TACTICS_WEATHERING_PLAN,
  CHRONICLES_TACTICS_WEATHERING_STYLE,
  installChroniclesTacticsStoneWeathering,
} from './chroniclesOfMatthiasWeatheringArt.js';

describe('Chronicles Tactics perimeter weathering', () => {
  it('keeps all weathering out of the clean tactical centre', () => {
    expect(CHRONICLES_TACTICS_WEATHERING_STYLE).toMatchObject({
      motif: 'perimeter-weathering',
      desktopPieceCount: 12,
      coarsePieceCount: 6,
    });
    expect(CHRONICLES_TACTICS_WEATHERING_PLAN).toHaveLength(12);
    CHRONICLES_TACTICS_WEATHERING_PLAN.forEach((piece) => {
      expect(Math.max(Math.abs(piece.x), Math.abs(piece.z))).toBeGreaterThan(5.5);
      expect(piece.sx).toBeLessThan(0.6);
      expect(piece.sz).toBeLessThan(0.3);
    });
  });

  it('installs twelve non-interactive stone details on desktop and reuses them', () => {
    const scene = new THREE.Scene();
    const first = installChroniclesTacticsStoneWeathering(scene, { coarsePointer: false });
    const second = installChroniclesTacticsStoneWeathering(scene, { coarsePointer: false });

    expect(first?.name).toBe('chronicles-stone-weathering');
    expect(second).toBe(first);
    expect(first?.children).toHaveLength(12);
    expect(scene.children.filter((child) => child.name === 'chronicles-stone-weathering')).toHaveLength(1);
    first?.children.forEach((piece) => {
      expect(piece.userData.chroniclesIsoCell).toBeUndefined();
      expect(piece.userData.chroniclesIsoEnemyId).toBeUndefined();
      expect(piece.receiveShadow).toBe(true);
    });
  });

  it('halves decorative geometry on coarse pointers', () => {
    const scene = new THREE.Scene();
    const root = installChroniclesTacticsStoneWeathering(scene, { coarsePointer: true });

    expect(root?.children).toHaveLength(6);
    root?.children.forEach((piece) => expect(piece.castShadow).toBe(false));
  });

  it('fails closed without a scene', () => {
    expect(installChroniclesTacticsStoneWeathering(null)).toBeNull();
  });
});
