import { describe, expect, it, vi } from 'vitest';

vi.mock('three', async () => {
  const actual = await vi.importActual('three');
  return {
    ...actual,
    TextureLoader: class {
      load(_url, onLoad) {
        const texture = {
          repeat: { set: vi.fn() },
          offset: { set: vi.fn() },
          dispose: vi.fn(),
          needsUpdate: false,
        };
        onLoad(texture);
        return texture;
      }
    },
  };
});

import { createIntegratedMatthiasSlugSprite } from './pawnSlugMatthiasIntegratedSprites.js';
import { createWeaponSprite } from './pawnSlugSprites.js';

describe('Pawn Slug integrated Matthias runtime', () => {
  it('switches the baked atlas through the existing setWeapon contract', () => {
    const sprite = createIntegratedMatthiasSlugSprite();
    expect(sprite.userData.atlas.weapon).toBe('pistol');
    sprite.userData.setWeapon('shotgun');
    expect(sprite.userData.animation.weapon).toBe('shotgun');
    expect(sprite.userData.atlas.weapon).toBe('shotgun');
    expect(sprite.userData.atlas.source).toBe('primary');
  });

  it('keeps the old weapon model slot as a zero-geometry compatibility shell', () => {
    const shell = createWeaponSprite('pistol');
    expect(shell.userData.pawnSlugIntegratedWeaponShell).toBe(true);
    expect(shell.type).toBe('Object3D');
    expect(shell.children).toHaveLength(0);
  });
});
