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

import * as THREE from 'three';
import {
  PAWN_SLUG_MATTHIAS_BROWSER_RENDER_CONTRACT,
  PAWN_SLUG_MATTHIAS_INTEGRATED_ART,
  createIntegratedMatthiasSlugSprite,
  pawnSlugCanonicalMatthiasRenderStatus,
} from './pawnSlugMatthiasIntegratedSprites.js';

describe('Pawn Slug Matthias browser render contract', () => {
  it('requires premium body, loaded canonical head, locked identity and live attachment', () => {
    expect(PAWN_SLUG_MATTHIAS_BROWSER_RENDER_CONTRACT).toBe('data-pawn-slug-matthias-visual');
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.browserRenderContract).toBe(PAWN_SLUG_MATTHIAS_BROWSER_RENDER_CONTRACT);

    const sprite = createIntegratedMatthiasSlugSprite();
    expect(pawnSlugCanonicalMatthiasRenderStatus(sprite)).toBe(
      'premium-body:canonical-head:identity-locked:detached',
    );

    const scene = new THREE.Group();
    scene.add(sprite);
    expect(pawnSlugCanonicalMatthiasRenderStatus(sprite)).toBe(
      'premium-body:canonical-head:identity-locked:attached',
    );
  });
});
