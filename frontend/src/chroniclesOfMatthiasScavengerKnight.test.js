import { describe, expect, it } from 'vitest';
import { buildScavengerKnight } from './chroniclesOfMatthiasScavengerKnight.js';

describe('Chronicles scavenger knight art', () => {
  it('reads as a horse-headed chess knight carrying stolen hardware', () => {
    const knight = buildScavengerKnight();
    expect(knight.userData.chroniclesEnemyId).toBe('scavenger-knight');
    expect(knight.userData.chroniclesSilhouette).toBe('scavenger-knight-loot-horse');
    expect(knight.getObjectByName('scavenger-knight-horse-head')).toBeTruthy();
    expect(knight.getObjectByName('scavenger-knight-amber-eye')).toBeTruthy();
    expect(knight.getObjectByName('scavenger-knight-loot-satchel')).toBeTruthy();
    expect(knight.getObjectByName('scavenger-knight-key-ring-0')).toBeTruthy();
  });

  it('cuts trophy geometry on coarse pointers', () => {
    const desktop = buildScavengerKnight();
    const coarse = buildScavengerKnight({ coarsePointer: true });
    const rings = (root) => root.children.filter((child) => child.name.startsWith('scavenger-knight-key-ring-')).length;
    expect(rings(desktop)).toBe(3);
    expect(rings(coarse)).toBe(1);
  });
});
