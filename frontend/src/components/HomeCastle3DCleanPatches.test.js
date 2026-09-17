import { describe, expect, it } from 'vitest';
import { createCanonicalHallGeometry } from './HomeCastle3DGeometry.js';
import {
  HOME_CASTLE_CLEAN_PATCH_PLAN,
  HOME_CASTLE_ORIGINAL_UV_ATTRIBUTE,
  applyHomeCastleBackgroundCleanPatches,
  restoreHomeCastleOriginalUvs,
} from './HomeCastle3DCleanPatches.js';

function uvSnapshot(geometry) {
  return Array.from(geometry.getAttribute('uv').array);
}

describe('HomeCastle3D clean patches', () => {
  it('starts with one deliberately small tournament pilot patch', () => {
    expect(HOME_CASTLE_CLEAN_PATCH_PLAN).toHaveLength(1);
    expect(HOME_CASTLE_CLEAN_PATCH_PLAN[0].id).toBe('tournament');
    expect(HOME_CASTLE_CLEAN_PATCH_PLAN[0].size.width).toBeLessThan(0.25);
    expect(HOME_CASTLE_CLEAN_PATCH_PLAN[0].size.height).toBeLessThan(0.2);
  });

  it('clone-stamps only a bounded part of the canonical background UVs', () => {
    const geometry = createCanonicalHallGeometry({ widthSegments: 64, heightSegments: 36 });
    const before = uvSnapshot(geometry);

    applyHomeCastleBackgroundCleanPatches(geometry);

    const after = uvSnapshot(geometry);
    let changedValues = 0;
    for (let index = 0; index < before.length; index += 1) {
      if (Math.abs(before[index] - after[index]) > 1e-8) changedValues += 1;
    }

    expect(changedValues).toBeGreaterThan(0);
    expect(changedValues).toBeLessThan(before.length * 0.08);
    expect(geometry.getAttribute(HOME_CASTLE_ORIGINAL_UV_ATTRIBUTE)).toBeTruthy();
    geometry.dispose();
  });

  it('is idempotent so renderer restarts cannot compound the texture displacement', () => {
    const geometry = createCanonicalHallGeometry({ widthSegments: 64, heightSegments: 36 });

    applyHomeCastleBackgroundCleanPatches(geometry);
    const once = uvSnapshot(geometry);
    applyHomeCastleBackgroundCleanPatches(geometry);
    const twice = uvSnapshot(geometry);

    expect(twice).toEqual(once);
    geometry.dispose();
  });

  it('preserves the untouched source UVs for later foreground mattes', () => {
    const geometry = createCanonicalHallGeometry({ widthSegments: 64, heightSegments: 36 });
    const before = uvSnapshot(geometry);

    applyHomeCastleBackgroundCleanPatches(geometry);
    restoreHomeCastleOriginalUvs(geometry);

    expect(uvSnapshot(geometry)).toEqual(before);
    expect(geometry.getAttribute(HOME_CASTLE_ORIGINAL_UV_ATTRIBUTE)).toBeUndefined();
    geometry.dispose();
  });
});
