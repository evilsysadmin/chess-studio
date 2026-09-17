import { describe, expect, it, vi } from 'vitest';
import { PAWN_SLUG_CANONICAL_HANDOFF as meta, pawnSlugCanonicalPistolWindow } from './pawnSlugCanonicalHandoff.js';
const pending = [];
vi.mock('three', async () => ({
  ...await vi.importActual('three'),
  TextureLoader: class { load(url, success, progress, failure) { pending.push({ url, success, failure }); } },
}));
import { createIntegratedMatthiasSlugSprite, pawnSlugIntegratedWeaponAtlasUrl } from './pawnSlugMatthiasIntegratedSprites.js';
const texture = () => ({ repeat: { set: vi.fn() }, offset: { set: vi.fn() }, dispose: vi.fn() });
describe('approved canonical handoff', () => {
  it('uses the full canonical pistol v4 bank and keeps guarded windows inside the atlas', () => {
    expect(meta.version).toBe('canonical-pistol-v4');
    expect(meta.width).toBe(3072);
    expect(meta.height).toBe(960);
    expect(meta.sourceFacing).toBe('left');
    expect(meta.actions.idle.count).toBe(10);
    expect(meta.actions.walk.count).toBe(10);
    expect(meta.actions.run.count).toBe(16);
    expect(meta.actions.crouch.count).toBe(10);
    expect(meta.actions.jump.count).toBe(9);

    for (const action of [...Object.keys(meta.actions), 'unknown', 'constructor']) {
      for (const frame of [-17, 0, 3, 19, NaN, Infinity]) {
        for (const dir of [-1, 1]) {
          const w = pawnSlugCanonicalPistolWindow(action, frame, dir);
          expect(Math.min(w.offsetX, w.offsetX + w.repeatX)).toBeGreaterThan(0);
          expect(Math.max(w.offsetX, w.offsetX + w.repeatX)).toBeLessThan(1);
          expect(w.offsetY).toBeGreaterThan(0);
          expect(w.offsetY + w.repeatY).toBeLessThan(1);
          expect(w.mirrored).toBe(dir >= 0);
        }
      }
    }
    expect(pawnSlugCanonicalPistolWindow('unknown').action).toBe('idle');
  });
  it('uses the baked canonical face and never substitutes pistol for another weapon', () => {
    pending.length = 0;
    const sprite = createIntegratedMatthiasSlugSprite();
    pending[0].success(texture()); pending[1].success(texture());
    expect(sprite.userData.canonicalHead.sprite.material.visible).toBe(false);
    sprite.userData.setActionFrame('run', 2);
    sprite.userData.setFiring(true);
    const w = pawnSlugCanonicalPistolWindow('idle', 2, 1);
    expect(sprite.material.map.offset.set).toHaveBeenLastCalledWith(w.offsetX, w.offsetY);
    sprite.userData.setWeapon('shotgun');
    expect(sprite.material.visible).toBe(false);
    expect(pending[2].url).not.toBe(pawnSlugIntegratedWeaponAtlasUrl('pistol'));
    sprite.userData.setWeapon('shotgun');
    expect(pending).toHaveLength(3);
    pending[2].failure();
    expect(sprite.material.visible).toBe(false);
    sprite.userData.setWeapon('shotgun');
    pending[3].success(texture());
    expect(sprite.userData.atlas.weapon).toBe('shotgun');
    expect(sprite.userData.canonicalHead.sprite.material.visible).toBe(false);
  });
  it('discards stale weapon loads', () => {
    pending.length = 0;
    const sprite = createIntegratedMatthiasSlugSprite();
    sprite.userData.setWeapon('machinegun');
    const old = texture(); const current = texture();
    pending[2].success(current); pending[0].success(old);
    expect(old.dispose).toHaveBeenCalled();
    expect(sprite.material.map).toBe(current);
  });
});
