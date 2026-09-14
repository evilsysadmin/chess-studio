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
    expect(dungeon.getObjectByName('chronicles-floor-inset-0')).toBeTruthy();
  });

  it('derives architectural wall faces from actual walkable adjacency', () => {
    const faces = chroniclesExposedWallFaces();

    expect(faces).toHaveLength(36);
    expect(faces.some((face) => face.side === 'north')).toBe(true);
    expect(faces.some((face) => face.side === 'south')).toBe(true);
    expect(faces.some((face) => face.side === 'east')).toBe(true);
    expect(faces.some((face) => face.side === 'west')).toBe(true);
  });

  it('uses deterministic albedo, relief and roughness maps on the dungeon shell', () => {
    const dungeon = buildChroniclesDungeonDressing();
    const floor = dungeon.getObjectByName('chronicles-floor-slab-0');
    const wall = dungeon.getObjectByName('chronicles-wall-surface-0');

    expect(wall).toBeTruthy();
    expect(floor?.material?.map?.isDataTexture).toBe(true);
    expect(floor?.material?.bumpMap?.isDataTexture).toBe(true);
    expect(floor?.material?.roughnessMap?.isDataTexture).toBe(true);
    expect(wall?.material?.map?.isDataTexture).toBe(true);
    expect(wall?.material?.bumpMap?.isDataTexture).toBe(true);
    expect(wall?.material?.roughnessMap?.isDataTexture).toBe(true);
    expect(wall?.material?.bumpScale).toBeGreaterThan(0);
  });

  it('keeps exposed-wall surface panels outside the base wall instead of burying the dressing inside it', () => {
    const dungeon = buildChroniclesDungeonDressing();
    const faces = chroniclesExposedWallFaces();

    faces.forEach((face, index) => {
      const surface = dungeon.getObjectByName(`chronicles-wall-surface-${index}`);
      const detail = dungeon.getObjectByName(`chronicles-wall-course-low-${index}`);
      const [wallX, wallZ] = [(face.x - 3) * 4, (face.y - 3) * 4];
      const axis = face.side === 'north' || face.side === 'south' ? 'z' : 'x';
      const center = axis === 'z' ? wallZ : wallX;
      expect(Math.abs(surface.position[axis] - center)).toBeGreaterThan(2);
      expect(Math.abs(detail.position[axis] - center)).toBeGreaterThan(Math.abs(surface.position[axis] - center));
    });
  });

  it('adds authored gate, sigil and architectural landmarks with state-reactive rune material', () => {
    const dungeon = buildChroniclesDungeonDressing();

    expect(dungeon.getObjectByName('chronicles-gate-inner-rune')).toBeTruthy();
    expect(dungeon.getObjectByName('chronicles-gate-keystone')).toBeTruthy();
    expect(dungeon.getObjectByName('chronicles-sigil-outer-ring')).toBeTruthy();
    expect(dungeon.getObjectByName('chronicles-chain-ring-0')).toBeTruthy();
    expect(dungeon.getObjectByName('chronicles-ceiling-rib-0-0')).toBeTruthy();
    expect(dungeon.getObjectByName('chronicles-crypt-crest-0')).toBeTruthy();
    expect(dungeon.userData.chroniclesRuneMaterials).toHaveLength(1);
  });

  it('adds desktop-only dampness and wall ageing without bloating the coarse-pointer scene', () => {
    const desktop = buildChroniclesDungeonDressing();
    const coarse = buildChroniclesDungeonDressing({ coarsePointer: true });

    expect(desktop.getObjectByName('chronicles-floor-puddle-0')).toBeTruthy();
    expect(desktop.getObjectByName('chronicles-wall-grime-0-0')).toBeTruthy();
    expect(coarse.getObjectByName('chronicles-floor-puddle-0')).toBeFalsy();
    expect(coarse.getObjectByName('chronicles-wall-grime-0-0')).toBeFalsy();
  });

  it('authors crypt set dressing against real wall faces while leaving coarse-pointer geometry lean', () => {
    const desktop = buildChroniclesDungeonDressing();
    const coarse = buildChroniclesDungeonDressing({ coarsePointer: true });
    const names = desktop.children.map((node) => node.name);
    const coarseNames = coarse.children.map((node) => node.name);

    ['chronicles-wall-niche-', 'chronicles-hanging-chain-', 'chronicles-sarcophagus-', 'chronicles-drain-'].forEach((prefix) => {
      expect(names.some((name) => name.startsWith(prefix))).toBe(true);
      expect(coarseNames.some((name) => name.startsWith(prefix))).toBe(false);
    });
  });

  it('uses a restrained warm/cold hero-light composition and disables expensive shadows on coarse pointers', () => {
    const desktop = buildChroniclesDungeonDressing();
    const coarse = buildChroniclesDungeonDressing({ coarsePointer: true });
    const desktopLights = desktop.userData.chroniclesAccentLights;
    const coarseLights = coarse.userData.chroniclesAccentLights;

    expect(desktopLights).toHaveLength(5);
    expect(desktop.getObjectByName('chronicles-sigil-light')).toBeTruthy();
    expect(desktop.getObjectByName('chronicles-gate-light')).toBeTruthy();
    expect(desktop.getObjectByName('chronicles-crypt-cold-fill')).toBeTruthy();
    expect(desktop.getObjectByName('chronicles-gate-key')?.isSpotLight).toBe(true);
    expect(desktop.getObjectByName('chronicles-crypt-rim')?.isSpotLight).toBe(true);
    expect(desktopLights.some((light) => light.castShadow)).toBe(true);
    expect(coarseLights.every((light) => light.castShadow === false)).toBe(true);
  });

  it('keeps a non-shadow readability fill and gives coarse pointers extra ambient help', () => {
    const desktop = buildChroniclesDungeonDressing();
    const coarse = buildChroniclesDungeonDressing({ coarsePointer: true });
    const desktopFill = desktop.userData.chroniclesReadabilityLight;
    const coarseFill = coarse.userData.chroniclesReadabilityLight;

    expect(desktopFill?.isHemisphereLight).toBe(true);
    expect(desktopFill?.castShadow).toBe(false);
    expect(coarseFill?.isHemisphereLight).toBe(true);
    expect(coarseFill?.intensity).toBeGreaterThan(desktopFill?.intensity || 0);
  });

  it('reduces decorative geometry on coarse pointers while retaining authored depth cues', () => {
    const desktop = buildChroniclesDungeonDressing();
    const coarse = buildChroniclesDungeonDressing({ coarsePointer: true });

    const decorativeCount = (root) => root.children.filter((node) => /floor-crack|floor-inset|floor-puddle|wall-pilaster|wall-relief|wall-grime|wall-mineral|wall-niche|hanging-chain|sarcophagus|drain|crypt-crest/.test(node.name)).length;
    expect(decorativeCount(desktop)).toBeGreaterThan(decorativeCount(coarse));
    expect(coarse.getObjectByName('chronicles-ceiling-rib-0-0')).toBeTruthy();
    expect(coarse.getObjectByName('chronicles-gate-keystone')).toBeTruthy();
    expect(coarse.getObjectByName('chronicles-wall-surface-0')).toBeTruthy();
  });
});
