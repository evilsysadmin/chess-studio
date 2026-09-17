import { describe, expect, it } from 'vitest';
import { buildChroniclesSurfacePatina } from './chroniclesOfMatthiasSurfacePatina.js';

describe('Chronicles of Matthias surface patina', () => {
  it('uses a richer but still bounded desktop surface budget', () => {
    const desktop = buildChroniclesSurfacePatina();
    const coarse = buildChroniclesSurfacePatina({ coarsePointer: true });

    expect(desktop.userData.chroniclesSurfacePatinaStats).toEqual({ wallPatchCount: 9, floorPatchCount: 7, materialCount: 3 });
    expect(coarse.userData.chroniclesSurfacePatinaStats).toEqual({ wallPatchCount: 4, floorPatchCount: 3, materialCount: 3 });
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

  it('authors the first patches inside the opening sightline instead of random remote cells', () => {
    const root = buildChroniclesSurfacePatina();
    const wall = root.getObjectByName('chronicles-wall-patina-0');
    const floor = root.getObjectByName('chronicles-floor-patina-0');

    // Spawn is x=1,y=5 looking east. The first floor patch is authored one cell
    // ahead, while the first wall patch sits on the south face beside that route.
    expect(floor.position.x).toBeGreaterThan(-5);
    expect(floor.position.x).toBeLessThan(-3);
    expect(floor.position.z).toBeGreaterThan(7.5);
    expect(floor.position.z).toBeLessThan(8.5);
    expect(wall.position.x).toBe(-4);
    expect(wall.position.z).toBeGreaterThan(9.7);
    expect(wall.position.z).toBeLessThan(10);
  });

  it('uses the supplied scene plan instead of canonical crypt coordinates', () => {
    const scenePlan = {
      center: { x: 1, y: 1 },
      floors: [
        { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 },
      ],
      wallFaces: [
        { x: 0, y: 1, side: 'east' },
        { x: 1, y: 0, side: 'south' },
        { x: 2, y: 0, side: 'south' },
        { x: 3, y: 1, side: 'west' },
      ],
    };
    const root = buildChroniclesSurfacePatina({ scenePlan });
    const wall = root.getObjectByName('chronicles-wall-patina-0');
    const floor = root.getObjectByName('chronicles-floor-patina-0');

    expect(root.userData.chroniclesSurfacePatinaStats).toEqual({
      wallPatchCount: 4,
      floorPatchCount: 4,
      materialCount: 3,
    });
    expect(wall.position.x).toBeGreaterThan(-2);
    expect(wall.position.x).toBeLessThan(-1.7);
    expect(wall.position.z).toBe(0);
    expect(floor.position.x).toBeGreaterThan(3.5);
    expect(floor.position.x).toBeLessThan(4.5);
    expect(floor.position.z).toBeGreaterThan(-0.5);
    expect(floor.position.z).toBeLessThan(0.5);
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
