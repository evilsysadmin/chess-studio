import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildChroniclesCampaignExterior, settlementHouseBlocks } from './chroniclesCampaignExterior3D.js';
import swordhavenFirstBook from './maps/swordhaven-first-book.json';

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

  it('dresses First Book Swordhaven blocks as village houses and keeps only the town wall as blockers', () => {
    const grid = swordhavenFirstBook.grid;
    const width = grid[0].length;
    const height = grid.length;
    const blocks = settlementHouseBlocks(grid, width, height);
    expect(blocks.map(({ cx, cy }) => [cx, cy])).toEqual([[4, 3.5], [14, 3.5], [4, 10.5], [14, 10.5]]);
    const scene = new THREE.Scene();
    buildChroniclesCampaignExterior(scene, {
      coarsePointer: true,
      scenePlan: {
        mapId: 'swordhaven-first-book', regionKind: 'settlement', width, height,
        center: { x: 9, y: 7 }, grid, content: [],
      },
    });
    const town = scene.getObjectByName('chronicles-campaign-town');
    const houses = town.children.filter(child => child.name.startsWith('swordhaven-building-'));
    expect(houses).toHaveLength(4);
    // South-side houses turn their facade to the street.
    expect(houses.map(house => house.rotation.y)).toEqual([0, 0, Math.PI, Math.PI]);
    const border = grid.join('').split('#').length - 1 - blocks.reduce((sum, b) => sum + b.cells.length, 0);
    expect(scene.getObjectByName('chronicles-campaign-visible-blockers').count).toBe(border);
    // Every house footprint stays on its blocked cells: no walkable tile is covered.
    blocks.forEach(({ cells }) => cells.forEach(({ x, y }) => expect(grid[y][x]).toBe('#')));
  });
});
