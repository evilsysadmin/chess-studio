import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { hansQuickIterationFrame } from './WarRoomHansIteration.js';
import { readWarRoomHansStageAnchors } from './WarRoomHansStage.js';

// Explicitly matches the Blender V2 builder's service-door authoring contract.
// These are room-floor X/Y, not projected screen or JS camera coordinates.
const V2_STOPS = Object.freeze({
  WR_ANCHOR_hans_hearth: [-4.55, 4.55],
  WR_ANCHOR_hans_door: [-9.55, 3.80],
  WR_ANCHOR_hans_basket: [-6.56, 4.96],
  WR_ANCHOR_hans_tools: [-6.42, 5.48],
  WR_ANCHOR_hans_corridor_0: [-7.42, 3.82],
  WR_ANCHOR_hans_corridor_1: [-7.10, 4.35],
  WR_ANCHOR_hans_corridor_2: [-6.66, 4.78],
});
const TABLE_HALF = 5.32;
const ACTOR_RADIUS = 0.56;
const LEFT_ARMOUR_BASE = Object.freeze([-7.55, 6.15]);
const ARMOUR_PLINTH_RADIUS = 0.62;
const CLEARANCE_TOLERANCE = 0.04;

function v2Shell(whiteSide) {
  const scene = new THREE.Scene();
  const shell = new THREE.Group();
  shell.position.y = -1.12;
  if (!whiteSide) shell.rotation.y = Math.PI;
  scene.add(shell);
  for (const [name, [x, y]] of Object.entries(V2_STOPS)) {
    const node = new THREE.Object3D();
    node.name = name;
    node.position.set(x, 0, -y);
    shell.add(node);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 2.7),
    new THREE.MeshBasicMaterial());
  door.name = 'WR_HANS_door_leaf';
  shell.add(door);
  scene.updateMatrixWorld(true);
  return shell;
}

describe('V2 · Hans can enter and work without clipping the command table', () => {
  for (const whiteSide of [true, false]) {
    it(`preserves physical board clearance throughout the routine (${whiteSide ? 'white' : 'black'})`, () => {
      const shell = v2Shell(whiteSide);
      const { missing, stage, hearth, side, towardBoard } = readWarRoomHansStageAnchors(
        shell, { id: 'v2-blender-hall' },
      );
      expect(missing).toEqual([]);
      expect(stage.fireWorkX).toBe(1.85);
      expect(stage.corridor).toHaveLength(4);
      // x=-8.68 wall is 4.13 m laterally from the hearth, in this frame.
      // Hans must begin in the alcove, not already inside the hall.
      const wallPlaneLocalX = 8.68 - 4.55;
      expect(stage.doorX).toBeGreaterThan(wallPlaneLocalX + ACTOR_RADIUS);
      const outside = hansQuickIterationFrame(0, { stage });
      const inside = hansQuickIterationFrame(6, { stage });
      expect(outside.hansX).toBeGreaterThan(wallPlaneLocalX + ACTOR_RADIUS);
      expect(inside.hansX).toBeLessThan(wallPlaneLocalX - ACTOR_RADIUS);
      expect(outside.doorOpen).toBe(1);
      expect(inside.doorOpen).toBe(0);
      const visited = new Set();
      for (let tick = 0; tick <= 380; tick += 1) {
        const frame = hansQuickIterationFrame(tick / 10, { stage });
        if (!frame.hansVisible) continue;
        visited.add(frame.phase);
        const worldX = hearth.x + side * frame.hansX;
        const worldZ = hearth.z + towardBoard * frame.hansZ;
        const x = whiteSide ? worldX : -worldX;
        const y = whiteSide ? -worldZ : worldZ;
        const dx = Math.max(Math.abs(x) - TABLE_HALF, 0);
        const dy = Math.max(Math.abs(y) - TABLE_HALF, 0);
        const gap = Math.hypot(dx, dy);
        expect(gap, `Hans intersects command table at (${x.toFixed(2)}, ${y.toFixed(2)}) in ${frame.phase}`)
          .toBeGreaterThanOrEqual(ACTOR_RADIUS);
        const armourX = whiteSide ? LEFT_ARMOUR_BASE[0] : -LEFT_ARMOUR_BASE[0];
        const armourY = whiteSide ? LEFT_ARMOUR_BASE[1] : -LEFT_ARMOUR_BASE[1];
        const armourGap = Math.hypot(x - armourX, y - armourY);
        expect(armourGap,
          `Hans clips left-armour plinth at (${x.toFixed(2)}, ${y.toFixed(2)}) in ${frame.phase}`)
          .toBeGreaterThanOrEqual(ACTOR_RADIUS + ARMOUR_PLINTH_RADIUS + CLEARANCE_TOLERANCE);
      }
      for (const phase of ['fire-dimming', 'take-log', 'carry-log', 'place-log',
        'take-poker', 'stoke-fire', 'return-poker', 'leave']) {
        expect(visited.has(phase), `missing Hans phase ${phase}`).toBe(true);
      }
      shell.clear();
    });
  }
});
