import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildChroniclesCampaignExterior, settlementHouseBlocks, settlementHouseFacing } from './chroniclesCampaignExterior3D.js';
import swordhavenFirstBook from './maps/swordhaven-first-book.json';
import rookwood from './maps/rookwood-first-book.json';

const demo = {
  mapId: 'banner-road', regionKind: 'wilderness', width: 5, height: 5,
  center: { x: 2, y: 2 },
  grid: ['#####', '#...#', '#.#.#', '#...#', '#####'],
  content: [
    { id: 'exit-1', kind: 'exit', position: { x: 2, y: 1 }, visible: true },
    { id: 'milestone-1', kind: 'lore', position: { x: 3, y: 2 }, visible: true },
  ],
};

describe('Chronicles file-authored exterior renderer', () => {

  it('renders F1 as a tall single-cell lighthouse with light driven by activatedRoot', () => {
    const scene = new THREE.Scene();
    const content = [{ id: 'f1-beacon-rescue', kind: 'lore',
      visualType: 'frozen-beacon', position: { x: 3, y: 2 }, visible: true }];
    const result = buildChroniclesCampaignExterior(scene, {
      scenePlan: { ...demo, grid: ['#####', '#...#', '#...#', '#...#', '#####'], content },
      coarsePointer: true,
    });
    const tower = scene.getObjectByName('chronicles-campaign-content-f1-beacon-rescue');
    // Measure structural mesh bounds only. The optional, non-colliding
    // light sprite intentionally extends beyond the one-cell tower.
    const bbox = new THREE.Box3();
    tower.updateWorldMatrix(true, true);
    tower.children
      .filter((child) => child !== result.contentProps[0].activatedRoot)
      .forEach((child) => bbox.expandByObject(child));
    expect(bbox.max.y).toBeGreaterThan(10);
    expect(bbox.max.x - bbox.min.x).toBeLessThan(4);
    expect(bbox.max.z - bbox.min.z).toBeLessThan(4);
    expect(result.contentProps).toHaveLength(1);
    expect(result.contentProps[0].activatedRoot.name).toBe('chronicles-f1-beacon-lit');
    expect(result.contentProps[0].activatedRoot.visible).toBe(false);
    result.contentProps[0].activatedRoot.visible = true;
    const lit = result.contentProps[0].activatedRoot;
    const flare = lit.children.find((child) => child.name === 'chronicles-f1-beacon-distance-bloom');
    expect(flare).toBeInstanceOf(THREE.Sprite);
    expect(flare.material.map.image.width).toBe(48);
    expect(lit.children.find((child) => child.name === 'chronicles-f1-beacon-stone-wash')).toBeInstanceOf(THREE.PointLight);
    expect(lit.children.length).toBeGreaterThanOrEqual(4);
    expect(scene.getObjectByName('chronicles-campaign-visible-blockers').count).toBe(16);
  });
  it('builds the road without a dungeon ceiling, maps visible blockers only to wall cells', () => {
    const scene = new THREE.Scene();
    const built = buildChroniclesCampaignExterior(scene, { scenePlan: demo, coarsePointer: true });
    expect(scene.getObjectByName('chronicles-campaign-terrain')).toBeTruthy();
    expect(scene.getObjectByName('chronicles-campaign-road')).toBeTruthy();
    const walls = scene.getObjectByName('chronicles-campaign-visible-blockers');
    expect(walls).toBeInstanceOf(THREE.InstancedMesh);
    expect(walls.count).toBe(demo.grid.join('').split('#').length - 1);
    expect(scene.getObjectByName('chronicles-first-person-ceiling')).toBeUndefined();
    expect(built.sceneCenter).toEqual(demo.center);
    expect(built.contentProps.map(x => x.id)).toEqual(['exit-1', 'milestone-1']);
    expect(built.enemies).toEqual({});
  });
  it('does not invent solid obstacles on a completely open authored field', () => {
    const scene = new THREE.Scene();
    buildChroniclesCampaignExterior(scene, {
      scenePlan: { ...demo, grid: ['.....', '.....', '.....', '.....', '.....'], content: [] },
      coarsePointer: true,
    });
    expect(scene.getObjectByName('chronicles-campaign-visible-blockers')).toBeUndefined();
  });

  it('dresses First Book Swordhaven as a town: shops styled by the NPC at their door, facades on the street', () => {
    const grid = swordhavenFirstBook.grid;
    const width = grid[0].length;
    const height = grid.length;
    const center = { x: 9, y: 7 };
    const blocks = settlementHouseBlocks(grid, width, height);
    expect(blocks).toHaveLength(10);
    const content = [...swordhavenFirstBook.interactables, ...swordhavenFirstBook.exits]
      .map(entry => ({ ...entry, position: { x: entry.x, y: entry.y } }));
    // Every authored shop NPC stands on a walkable door cell of a real block.
    const doors = blocks.map(block => settlementHouseFacing(block, grid, center).door);
    for (const shop of content.filter(entry => String(entry.visualType || '').startsWith('building-'))) {
      expect(grid[shop.y][shop.x]).toBe('.');
      expect(doors).toContainEqual({ x: shop.x, y: shop.y });
    }
    const scene = new THREE.Scene();
    buildChroniclesCampaignExterior(scene, {
      coarsePointer: true,
      scenePlan: { mapId: 'swordhaven-first-book', regionKind: 'settlement', width, height, center, grid, content },
    });
    const town = scene.getObjectByName('chronicles-campaign-town');
    const names = town.children.map(child => child.name).filter(name => name.startsWith('swordhaven-building-'));
    expect(names).toHaveLength(10);
    for (const style of ['forge', 'armor', 'tavern', 'temple', 'store', 'watch']) {
      expect(names.some(name => name.startsWith('swordhaven-building-first-book-' + style + '-'))).toBe(true);
    }
    // Only the town wall stays as plain blockers; the lone plaza cell is the fountain.
    const wall = grid.reduce((sum, row, y) => sum + [...row].filter((tile, x) => (
      tile === '#' && (x === 0 || y === 0 || x === width - 1 || y === height - 1))).length, 0);
    expect(scene.getObjectByName('chronicles-campaign-visible-blockers').count).toBe(wall);
    expect(town.getObjectByName('swordhaven-fountain')).toBeTruthy();
  });

  it('builds the Rookwood forest with pixel-art bark and foliage', () => {
    const grid = rookwood.grid;
    const scene = new THREE.Scene();
    buildChroniclesCampaignExterior(scene, {
      coarsePointer: true,
      scenePlan: {
        mapId: 'rookwood-first-book', regionKind: 'wilderness', width: grid[0].length, height: grid.length,
        center: { x: Math.floor(grid[0].length / 2), y: Math.floor(grid.length / 2) }, grid, content: [],
      },
    });
    const forest = scene.getObjectByName('chronicles-campaign-forest');
    expect(forest.children).toHaveLength(3);
    for (const mesh of forest.children) {
      expect(mesh.material.map?.magFilter).toBe(THREE.NearestFilter);
    }
  });
});
