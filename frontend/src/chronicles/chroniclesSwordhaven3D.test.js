import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildSwordhavenScene, createSwordhavenWalkGrid, SWORDHAVEN_BUILDINGS,
  SWORDHAVEN_INTERACTION_CELLS, SWORDHAVEN_GATE_CELL, SWORDHAVEN_SPAWN,
} from './chroniclesSwordhaven3D.js';

describe('Swordhaven modular real-time 3D', () => {
  it('has exactly the five canonical town services with unique content ids', () => {
    expect(SWORDHAVEN_BUILDINGS.map(b => b.id)).toEqual([
      'swordhaven-forge', 'swordhaven-armor', 'swordhaven-tavern',
      'swordhaven-magic', 'swordhaven-temple',
    ]);
    expect(new Set(SWORDHAVEN_BUILDINGS.map(b => b.id)).size).toBe(5);
  });

  it('keeps all five shop approaches and the southern gate reachable on the real collision grid', () => {
    const grid = createSwordhavenWalkGrid();
    expect(grid).toHaveLength(19);
    expect(grid.every(row => row.length === 19)).toBe(true);
    expect(grid[9][9]).toBe('#'); // Fountain, not an invisible obstruction.
    for (const { x, y } of SWORDHAVEN_BUILDINGS) expect(grid[y][x]).toBe('#');
    const destinations = [...SWORDHAVEN_INTERACTION_CELLS, SWORDHAVEN_GATE_CELL];
    const seen = new Set();
    const queue = [[SWORDHAVEN_SPAWN.x, SWORDHAVEN_SPAWN.y]];
    while (queue.length) {
      const [x, y] = queue.shift();
      const id = x + ':' + y;
      if (seen.has(id) || grid[y]?.[x] !== '.') continue;
      seen.add(id);
      queue.push([x + 1,y],[x - 1,y],[x,y + 1],[x,y - 1]);
    }
    for (const { x, y } of destinations) {
      expect(grid[y][x]).toBe('.');
      expect(seen.has(x + ':' + y)).toBe(true);
    }
  });

  it('builds a sunny outdoor mesh scene and selectable authored storefronts', () => {
    const scene = new THREE.Scene();
    const state = buildSwordhavenScene(scene, {
      scenePlan: {
        width: 19, height: 19, center: { x: 9, y: 9 },
        content: SWORDHAVEN_BUILDINGS.map(b => ({
          id: b.id, kind: 'lore', visible: true, position: { x: b.x, y: b.y },
        })),
      },
      coarsePointer: true,
    });
    expect(scene.background).toBeInstanceOf(THREE.Color);
    expect(scene.getObjectByName('swordhaven-sun')).toBeTruthy();
    expect(scene.getObjectByName('chronicles-swordhaven-town')).toBeTruthy();
    expect(scene.getObjectByName('chronicles-first-person-ceiling')).toBeFalsy();
    expect(scene.getObjectByName('swordhaven-fountain')).toBeTruthy();
    expect(scene.getObjectByName('swordhaven-cloud-0')).toBeTruthy();
    expect(scene.getObjectByName('perimeter-stone-wall--1')).toBeTruthy();
    expect(SWORDHAVEN_BUILDINGS.every(b => scene.getObjectByName('swordhaven-building-' + b.id))).toBe(true);
    expect(state.contentProps.map(p => p.id).sort())
      .toEqual(SWORDHAVEN_BUILDINGS.map(b => b.id).sort());
    expect(state.enemyDefinitions).toEqual([]);
    expect(state.spectralChapel.userData).toEqual({});
    expect(state.sceneCenter).toEqual({ x: 9, y: 9 });
  });

  it('renders storefronts without exposing fake shop interactions before they are authored', () => {
    const scene = new THREE.Scene();
    const state = buildSwordhavenScene(scene, { scenePlan: { content: [] } });
    expect(state.contentProps).toHaveLength(0);
    expect(scene.getObjectByName('swordhaven-building-swordhaven-forge')).toBeTruthy();
  });
});
