import { describe, expect, it } from 'vitest';
import { chroniclesIsoDungeonPlan } from './chroniclesIsoDungeonPlan.js';

describe('Chronicles isometric dungeon plan', () => {
  it('keeps the authored crypt topology and world props together', () => {
    const plan = chroniclesIsoDungeonPlan({ mapId: 'crypt-eight-squares' });
    expect(plan.mapId).toBe('crypt-eight-squares');
    expect(plan.width).toBe(7);
    expect(plan.height).toBe(7);
    expect(plan.grid).toHaveLength(7);
    expect(plan.sigil).toMatchObject({ id: expect.any(String), position: expect.any(Object) });
    expect(plan.lever).toMatchObject({ id: 'rune-cache-lever', position: expect.any(Object) });
    expect(plan.pickup).toMatchObject({ id: 'rune-core', position: expect.any(Object) });
  });

  it('does not leak crypt props into the fantasy Menagerie', () => {
    const plan = chroniclesIsoDungeonPlan({ mapId: 'menagerie-of-ash' });
    expect(plan.mapId).toBe('menagerie-of-ash');
    expect(plan.width).toBe(7);
    expect(plan.height).toBe(7);
    expect(plan.grid).toHaveLength(7);
    expect(plan.sigil).toBeNull();
    expect(plan.lever).toBeNull();
    expect(plan.pickup).toBeNull();
  });
});
