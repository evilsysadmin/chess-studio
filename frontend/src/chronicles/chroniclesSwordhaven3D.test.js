import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildSwordhavenScene, SWORDHAVEN_BUILDINGS } from './chroniclesSwordhaven3D.js';

describe('Swordhaven modular real-time 3D', () => {
  it('has exactly the five canonical town services with unique content ids', () => {
    expect(SWORDHAVEN_BUILDINGS.map(b => b.id)).toEqual([
      'swordhaven-forge', 'swordhaven-armor', 'swordhaven-tavern',
      'swordhaven-magic', 'swordhaven-temple',
    ]);
    expect(new Set(SWORDHAVEN_BUILDINGS.map(b => b.id)).size).toBe(5);
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
