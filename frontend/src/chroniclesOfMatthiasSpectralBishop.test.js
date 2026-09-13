import { describe, expect, it } from 'vitest';
import { buildSpectralBishop, buildSpectralChapel } from './chroniclesOfMatthiasSpectralBishop.js';

describe('Chronicles spectral bishop art', () => {
  it('keeps a bishop silhouette and a readable diagonal spectral identity', () => {
    const bishop = buildSpectralBishop();
    expect(bishop.userData.chroniclesEnemyId).toBe('spectral-bishop');
    expect(bishop.userData.chroniclesSilhouette).toBe('spectral-bishop-diagonal-seer');
    expect(bishop.getObjectByName('spectral-bishop-mitre')).toBeTruthy();
    expect(bishop.getObjectByName('spectral-bishop-diagonal-rift')).toBeTruthy();
    expect(bishop.getObjectByName('spectral-bishop-lantern-core')).toBeTruthy();
    expect(bishop.userData.chroniclesGlowMaterials).toHaveLength(1);
  });

  it('reduces decorative diagonal rifts on coarse pointers', () => {
    const desktop = buildSpectralBishop();
    const coarse = buildSpectralBishop({ coarsePointer: true });
    const count = (root) => root.children.filter((child) => child.name.startsWith('spectral-bishop-robe-rift-')).length;
    expect(count(desktop)).toBe(4);
    expect(count(coarse)).toBe(2);
  });

  it('builds a restrained side chapel and trims floor inlays on coarse pointers', () => {
    const desktop = buildSpectralChapel();
    const coarse = buildSpectralChapel({ coarsePointer: true });
    expect(desktop.getObjectByName('spectral-chapel-altar')).toBeTruthy();
    expect(desktop.getObjectByName('spectral-chapel-reliquary')).toBeTruthy();
    expect(desktop.userData.chroniclesGlowMaterials).toHaveLength(1);
    expect(desktop.userData.chroniclesLights).toHaveLength(1);
    const inlays = (root) => root.children.filter((child) => child.name.startsWith('spectral-chapel-diagonal-inlay-')).length;
    expect(inlays(desktop)).toBe(4);
    expect(inlays(coarse)).toBe(2);
  });
});
