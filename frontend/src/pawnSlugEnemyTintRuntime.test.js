import { describe, expect, it, vi } from 'vitest';
import { applyPawnSlugEnemyTint } from './pawnSlugEnemyRunSprites.js';

describe('Pawn Slug enemy tint runtime', () => {
  function spriteFixture(type = 'pawn') {
    return {
      userData: {
        enemyType: type,
        hurtStartedAt: 1,
        appliedHitFlash: null,
      },
      material: {
        opacity: 1,
        color: { setRGB: vi.fn() },
      },
    };
  }

  it('writes a healthy tint once and skips identical steady frames', () => {
    const sprite = spriteFixture();
    expect(applyPawnSlugEnemyTint(sprite, false, 2)).toBe(true);
    expect(applyPawnSlugEnemyTint(sprite, false, 3)).toBe(false);
    expect(sprite.material.color.setRGB).toHaveBeenCalledTimes(1);
    expect(sprite.material.opacity).toBe(1);
  });

  it('animates the hot impact then settles to one sustained material write', () => {
    const sprite = spriteFixture('rook');
    expect(applyPawnSlugEnemyTint(sprite, true, 1)).toBe(true);
    expect(applyPawnSlugEnemyTint(sprite, true, 1.01)).toBe(true);
    expect(applyPawnSlugEnemyTint(sprite, true, 1.2)).toBe(true);
    expect(applyPawnSlugEnemyTint(sprite, true, 1.4)).toBe(false);
    expect(sprite.material.color.setRGB).toHaveBeenCalledTimes(3);
  });

  it('restores neutral exactly once after hurt ends', () => {
    const sprite = spriteFixture();
    applyPawnSlugEnemyTint(sprite, true, 1.2);
    expect(applyPawnSlugEnemyTint(sprite, false, 1.3)).toBe(true);
    expect(applyPawnSlugEnemyTint(sprite, false, 1.4)).toBe(false);
    expect(sprite.material.opacity).toBe(1);
  });
});
