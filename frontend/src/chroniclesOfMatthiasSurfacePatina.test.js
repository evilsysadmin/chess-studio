import { describe, expect, it } from 'vitest';
import { buildChroniclesSurfacePatina } from './chroniclesOfMatthiasSurfacePatina.js';

describe('Chronicles of Matthias surface patina', () => {
  it('uses a richer but still bounded desktop surface budget', () => {
    const desktop = buildChroniclesSurfacePatina();
    const coarse = buildChroniclesSurfacePatina({ coarsePointer: true });

    expect(desktop.userData.chroniclesSurfacePatinaStats.wallPatchCount).toBeGreaterThan(4);
    expect(desktop.userData.chroniclesSurfacePatinaStats.wallPatchCount).toBeLessThanOrEqual(9);
    expect(desktop.userData.chroniclesSurfacePatinaStats.floorPatchCount).toBeGreaterThan(3);
    expect(desktop.userData.chroniclesSurfacePatinaStats.floorPatchCount).toBeLessThanOrEqual(7);
    expect(coarse.userData.chroniclesSurfacePatinaStats.wallPatchCount).toBeLessThanOrEqual(4);
    expect(coarse.userData.chroniclesSurfacePatinaStats.floorPatchCount).toBeLessThanOrEqual(3);
  });

  it('adds physical transparent patina instead of opaque geometry stickers', () => {
    const root = buildChroniclesSurfacePatina();
    const wall = root.getObjectByName('chronicles-wall-patina-0');
    const floor = root.getObjectByName('chronicles-floor-patina-0');

    expect(wall?.material?.isMeshPhysicalMaterial).toBe(true);
    expect(wall?.material?.transparent).toBe(true);
    expect(wall?.material?.depthWrite).toBe(false);
    expect(wall?.material?.alphaMap?.isDataTexture).toBe(true);
    expect(floor?.material?.isMeshPhysicalMaterial).toBe(true);
    expect(floor?.material?.alphaMap?.isDataTexture).toBe(true);
    expect(floor?.position.y).toBeGreaterThan(0.04);
    expect(wall?.castShadow).toBe(false);
    expect(floor?.castShadow).toBe(false);
  });

  it('places the patina deterministically so visual captures remain stable', () => {
    const first = buildChroniclesSurfacePatina();
    const second = buildChroniclesSurfacePatina();
    const a = first.getObjectByName('chronicles-floor-patina-0');
    const b = second.getObjectByName('chronicles-floor-patina-0');

    expect(a.position.toArray()).toEqual(b.position.toArray());
    expect(a.rotation.toArray()).toEqual(b.rotation.toArray());
  });
});
