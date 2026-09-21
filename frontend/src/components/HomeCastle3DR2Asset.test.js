import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  homeCastleR2AssetUrl,
  loadHomeCastleR2Scene,
} from './HomeCastle3DR2Asset.js';

const EXPECTED_HOME_ASSETS = Object.freeze([
  ['home.scene.runtime', '/home/scene/canonical/home-v2-runtime-6e6f8a6997fc98ab.glb'],
  ['home.tournament.trophy.runtime', '/home/tournament/trophy/tournament-cup-v1-e4c1210500fb5b67.glb'],
  ['home.combat.heraldry.runtime', '/home/combat/heraldry/combat-heraldry-v1-c5cd00fc94b82b89.glb'],
  ['home.play.rook.runtime', '/home/play/rook/play-rook-v1-3f49c19ffd8cb894.glb'],
]);

describe('HomeCastle3D R2 asset loading', () => {
  it.each(EXPECTED_HOME_ASSETS)('resolves %s from the promoted R2 manifest', (logicalId, suffix) => {
    expect(homeCastleR2AssetUrl(logicalId)).toBe(
      `https://assets.chess-studio.shadowops.dpdns.org${suffix}`,
    );
  });

  it('loads a remote GLB scene and updates its world matrices', async () => {
    const scene = new THREE.Group();
    const updateMatrixWorld = vi.spyOn(scene, 'updateMatrixWorld');
    const loader = {
      load: vi.fn((_url, resolve) => resolve({ scene })),
    };

    await expect(loadHomeCastleR2Scene({
      logicalId: 'home.play.rook.runtime',
      loader,
    })).resolves.toBe(scene);

    expect(loader.load).toHaveBeenCalledWith(
      expect.stringContaining('/home/play/rook/'),
      expect.any(Function),
      undefined,
      expect.any(Function),
    );
    expect(updateMatrixWorld).toHaveBeenCalledWith(true);
  });

  it('returns null on remote failure so the embedded/procedural fallback can take over', async () => {
    const loader = {
      load: vi.fn((_url, _resolve, _progress, reject) => reject(new Error('offline'))),
    };

    await expect(loadHomeCastleR2Scene({
      logicalId: 'home.combat.heraldry.runtime',
      loader,
    })).resolves.toBeNull();
  });

  it('lets tests and callers explicitly disable the remote attempt', async () => {
    const loader = { load: vi.fn() };
    await expect(loadHomeCastleR2Scene({
      logicalId: 'home.tournament.trophy.runtime',
      loader,
      assetUrl: '',
    })).resolves.toBeNull();
    expect(loader.load).not.toHaveBeenCalled();
  });
});
