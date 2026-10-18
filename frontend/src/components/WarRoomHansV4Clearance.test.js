import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { hansQuickIterationFrame } from './WarRoomHansIteration.js';
import { readWarRoomHansStageAnchors } from './WarRoomHansStage.js';

// Mirrors the actual Blender authoring coordinates. Its validator also checks
// the *real* generated mantel geometry, not only this gameplay fixture.
const V4_HEARTH = [-6.75, 4.0];
const DOOR_AND_STOPS = Object.freeze({
  WR_ANCHOR_hans_hearth: [-6.75, 4.0],
  WR_ANCHOR_hans_door: [-7.82, 1.23],
  WR_ANCHOR_hans_basket: [-6.95, 3.55],
  WR_ANCHOR_hans_tools: [-6.35, 3.42],
  WR_ANCHOR_hans_corridor_0: [-7.35, 1.95],
  WR_ANCHOR_hans_corridor_1: [-7.20, 2.65],
  WR_ANCHOR_hans_corridor_2: [-7.03, 3.08],
});
const ACTOR_CLEARANCE_RADIUS = 0.56;
const BOARD_HALF = 5.65;
const FIREPLACE = Object.freeze({ x: -6.75, y: 4.40, halfX: 1.66 * 0.64, halfY: 0.69 * 0.70 });

function makeShell(whiteSide) {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.position.y = -1.12;
  if (!whiteSide) root.rotation.y = Math.PI;
  scene.add(root);
  for (const [name, [x, y]] of Object.entries(DOOR_AND_STOPS)) {
    const anchor = new THREE.Object3D();
    anchor.name = name;
    anchor.position.set(x, 0, -y);
    root.add(anchor);
  }
  const leaf = new THREE.Object3D();
  leaf.name = 'WR_HANS_door_leaf';
  root.add(leaf);
  return root;
}

function rectGap(x, y, centerX, centerY, halfX, halfY) {
  return Math.hypot(
    Math.max(Math.abs(x - centerX) - halfX, 0),
    Math.max(Math.abs(y - centerY) - halfY, 0),
  );
}

describe('V4 · pasillo físico para Hans (no basta con que sea visible en cámara)', () => {
  for (const whiteSide of [true, false]) {
    it(`mantiene despejado el recorrido animado completo con ${whiteSide ? 'blancas' : 'negras'}`, () => {
      const shell = makeShell(whiteSide);
      const { stage, side, towardBoard, hearth, missing } = readWarRoomHansStageAnchors(
        shell, { id: 'v4-tower-study' },
      );
      expect(missing).toEqual([]);
      expect(stage.fireWorkX).toBe(0);
      expect(stage.corridor).toHaveLength(4);

      const visited = new Set();
      for (let tenths = 0; tenths <= 380; tenths += 1) {
        const frame = hansQuickIterationFrame(tenths / 10, { stage });
        if (!frame.hansVisible) continue;
        visited.add(frame.phase);
        const worldX = hearth.x + side * frame.hansX;
        const worldZ = hearth.z + towardBoard * frame.hansZ;
        // Reverse black-side shell rotation to check one authored floorplan.
        const x = whiteSide ? worldX : -worldX;
        const y = whiteSide ? -worldZ : worldZ;
        const gaps = [
          8.72 - Math.hypot(x, y + 0.72), // circular tower wall
          rectGap(x, y, 0, 0, BOARD_HALF, BOARD_HALF),
          rectGap(x, y, FIREPLACE.x, FIREPLACE.y, FIREPLACE.halfX, FIREPLACE.halfY),
          Math.hypot(x + 6.55, y + 0.75) - 0.48, // ceremonial armour
        ];
        for (const gap of gaps) {
          expect(gap, `Hans intersects scenery in ${frame.phase} at (${x.toFixed(2)}, ${y.toFixed(2)})`)
            .toBeGreaterThanOrEqual(ACTOR_CLEARANCE_RADIUS - 0.005);
        }
      }
      for (const phase of ['fire-dimming', 'take-log', 'carry-log', 'place-log', 'take-poker', 'stoke-fire', 'return-poker', 'leave']) {
        expect(visited.has(phase), `missing Hans animation phase: ${phase}`).toBe(true);
      }
      shell.clear();
    });
  }

  it('V4 no hereda el desplazamiento de trabajo que empuja a Hans contra el muro', () => {
    const shell = makeShell(true);
    const v4 = readWarRoomHansStageAnchors(shell, { id: 'v4-tower-study' }).stage;
    const v3 = readWarRoomHansStageAnchors(shell, { id: 'v3-armory-hall' }).stage;
    expect(v4.fireWorkX).toBe(0);
    expect(v3.fireWorkX).toBe(0.9);
    const v4Stoking = hansQuickIterationFrame(19.5, { stage: v4 });
    const v3Stoking = hansQuickIterationFrame(19.5, { stage: v3 });
    expect(v4Stoking.hansX).not.toBe(v3Stoking.hansX);
    shell.clear();
  });
});
