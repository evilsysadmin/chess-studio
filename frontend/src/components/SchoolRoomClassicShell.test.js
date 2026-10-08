import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildClassicWarRoomShell } from './SchoolRoomClassicShell.js';

const THEME = {
  frame: 0x24130c,
  glow: 0xb88a35,
};

function names(root) {
  const result = [];
  root.traverse((object) => {
    if (object.name) result.push(object.name);
  });
  return result;
}

describe('dedicated School Room classic shell', () => {
  it('builds the classroom without hidden War Room architecture', () => {
    const scene = new THREE.Scene();
    const boardGroup = new THREE.Group();
    scene.add(boardGroup);

    const { classicShellObjects } = buildClassicWarRoomShell({
      scene,
      boardGroup,
      theme: THEME,
      whiteSide: true,
      renderLite: false,
    });

    expect(classicShellObjects).toHaveLength(4);
    const school = classicShellObjects.find((object) => object.userData?.schoolRoomCanonical);
    expect(school?.userData.schoolRoomBootstrap).toBe('dedicated-v1');
    expect(school?.userData.schoolRoomRetiredWarRoomLayers).toBe(2);

    const allNames = names(scene);
    expect(allNames).toContain('matthias-school-room-layer');
    expect(allNames).toContain('premium-table-layer');
    expect(allNames).toContain('war-room-classic-board-frame');
    expect(allNames).not.toContain('premium-war-room-layer');
    expect(allNames).not.toContain('war-room-castle-architecture');
  });
});
