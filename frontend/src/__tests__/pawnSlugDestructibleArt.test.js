import { describe, expect, it } from 'vitest';
import { applyPawnSlugDestructibleDamageVisual, createPawnSlugDestructibleModel } from '../pawnSlugDestructibleArt.js';

describe('Pawn Slug destructible art', () => {
  it('builds distinct lightweight crate and barrel models', () => {
    const crate = createPawnSlugDestructibleModel('crate');
    const barrel = createPawnSlugDestructibleModel('barrel');
    expect(crate.userData.materialKind).toBe('wood');
    expect(barrel.userData).toMatchObject({ materialKind: 'metal', explosive: true });
    expect(crate.children.length).toBeGreaterThan(1);
    expect(barrel.children.length).toBeGreaterThan(1);
  });

  it('uses a cheap damaged-state transform and hides destroyed props', () => {
    const crate = createPawnSlugDestructibleModel('crate');
    applyPawnSlugDestructibleDamageVisual(crate, 0.4);
    expect(crate.rotation.z).not.toBe(0);
    expect(crate.visible).toBe(true);
    applyPawnSlugDestructibleDamageVisual(crate, 0);
    expect(crate.visible).toBe(false);
  });
});
