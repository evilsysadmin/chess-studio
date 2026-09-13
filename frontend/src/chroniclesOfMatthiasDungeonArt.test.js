import { describe, expect, it } from 'vitest';
import {
  buildChroniclesDungeonDressing,
  chroniclesExposedWallFaces,
  chroniclesWalkableCells,
} from './chroniclesOfMatthiasDungeonArt.js';

describe('Chronicles of Matthias dungeon art', () => {
  it('dresses every walkable map cell instead of relying on one flat floor plane', () => {
    const cells = chroniclesWalkableCells();
    const dungeon = buildChroniclesDungeonDressing();

    expect(cells).toHaveLength(19);
    expect(dungeon.getObjectByName('chronicles-floor-slab-0')).toBeTruthy();
    expect(dungeon.getObjectByName(`chronicles-floor-slab-${cells.length - 1}`)).toBeTruthy();
  });

  it('derives architectural wall faces from actual walkable adjacency', () => {
    const faces = chroniclesExposedWallFaces();

    expect(faces).toHaveLength(36);
    expect(faces.some((face) => face.side === 'north')).toBe(true);
    expect(faces.some((face) => face.side === 'south')).toBe(true);
    expect(faces.some((face) => face.side === 'east')).toBe(true);
    expect(faces.some((face) => face.side === 'west')).toBe(true);
  });

  it('adds authored gate and sigil landmarks with state-reactive rune material', () => {
    const dungeon = buildChroniclesDungeonDressing();

    expect(dungeon.getObjectByName('chronicles-gate-inner-rune')).toBeTruthy();
    expect(dungeon.getObjectByName('chronicles-sigil-outer-ring')).toBeTruthy();
    expect(dungeon.getObjectByName('chronicles-chain-ring-0')).toBeTruthy();
    expect(dungeon.userData.chroniclesRuneMaterials).toHaveLength(1);
  });

  it('reduces decorative geometry on coarse pointers', () => {
    const desktop = buildChroniclesDungeonDressing();
    const coarse = buildChroniclesDungeonDressing({ coarsePointer: true });

    const decorativeCount = (root) => root.children.filter((node) => /floor-crack|wall-pilaster/.test(node.name)).length;
    expect(decorativeCount(desktop)).toBeGreaterThan(decorativeCount(coarse));
  });
});
