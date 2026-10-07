import { describe, expect, it } from 'vitest';
import { buildScavengerKnight } from './chroniclesOfMatthiasScavengerKnight.js';

describe('Chronicles scavenger knight art', () => {
  it('reads as a humanoid scavenger hunter with a knight crest and stolen hardware', () => {
    const knight = buildScavengerKnight();
    expect(knight.userData.chroniclesEnemyId).toBe('scavenger-knight');
    expect(knight.userData.chroniclesSilhouette).toBe('scavenger-knight-armoured-hunter');
    expect(knight.userData.chroniclesArtTier).toBe('premium-threat-v3');
    expect(knight.getObjectByName('scavenger-knight-helmet')).toBeTruthy();
    expect(knight.getObjectByName('scavenger-knight-horse-crest')).toBeTruthy();
    expect(knight.getObjectByName('scavenger-knight-eye-slit')).toBeTruthy();
    expect(knight.getObjectByName('scavenger-knight-sword-blade')).toBeTruthy();
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
