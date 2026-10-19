import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { hansQuickIterationFrame } from './WarRoomHansIteration.js';
import { installWarRoomHansVariantStage, readWarRoomHansStageAnchors } from './WarRoomHansStage.js';

// Mirrors the actual Blender authoring coordinates. Its validator also checks
// the *real* generated mantel geometry, not only this gameplay fixture.
const DOOR_AND_STOPS = Object.freeze({
  WR_ANCHOR_hans_hearth: [-6.28, 3.05],
  WR_ANCHOR_hans_door: [-7.38, -1.37],
  WR_ANCHOR_hans_basket: [-6.42, 2.26],
  WR_ANCHOR_hans_tools: [-6.25, 2.23],
  WR_ANCHOR_hans_corridor_0: [-7.45, -0.53],
  WR_ANCHOR_hans_corridor_1: [-7.30, 0.50],
  WR_ANCHOR_hans_corridor_2: [-6.62, 1.76],
});
const ACTOR_CLEARANCE_RADIUS = 0.56;
const BOARD_HALF = 5.65;
const FIREPLACE = Object.freeze({
  x: -7.12, y: 3.08, halfX: 1.66 * 0.72, halfY: 0.67 * 0.55,
  angle: 62 * Math.PI / 180,
});
const RIGHT_ARMOUR = Object.freeze({ x: 7.45, y: -1.20, radius: 0.48 });
const LOUNGE = Object.freeze({ chair: [7.05, 1.55], rug: [6.95, 1.35], table: [6.10, 0.45] });

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

function mantelGap(x, y) {
  const dx = x - FIREPLACE.x;
  const dy = y - FIREPLACE.y;
  const cs = Math.cos(FIREPLACE.angle);
  const sn = Math.sin(FIREPLACE.angle);
  return rectGap(dx * cs + dy * sn, -dx * sn + dy * cs, 0, 0, FIREPLACE.halfX, FIREPLACE.halfY);
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
          mantelGap(x, y),
          Math.hypot(x + 6.55, y + 4.20) - 0.48, // ceremonial armour
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

  for (const whiteSide of [true, false]) {
    it(`coloca cesta y herramientas exactamente en sus anclajes físicos (${whiteSide ? 'blancas' : 'negras'})`, () => {
      const shell = makeShell(whiteSide);
      const scene = shell.parent;
      const stage = installWarRoomHansVariantStage(scene, { variant: 'v4', shellRoot: shell });
      try {
        expect(stage.status).toMatch(/^v4-tower-study:(quick|idle)$/);
        scene.updateMatrixWorld(true);
        const basket = scene.getObjectByName('war-room-hearth-log-basket');
        const tools = scene.getObjectByName('war-room-hearth-tool-stand');
        expect(basket).toBeTruthy();
        expect(tools).toBeTruthy();
        const basketWorld = basket.getWorldPosition(new THREE.Vector3());
        const toolsWorld = tools.getWorldPosition(new THREE.Vector3());
        const turn = whiteSide ? 1 : -1;
        expect(basketWorld.x * turn).toBeCloseTo(DOOR_AND_STOPS.WR_ANCHOR_hans_basket[0], 3);
        expect(-basketWorld.z * turn).toBeCloseTo(DOOR_AND_STOPS.WR_ANCHOR_hans_basket[1], 3);
        expect(toolsWorld.x * turn).toBeCloseTo(DOOR_AND_STOPS.WR_ANCHOR_hans_tools[0], 3);
        expect(-toolsWorld.z * turn).toBeCloseTo(DOOR_AND_STOPS.WR_ANCHOR_hans_tools[1], 3);
        expect(basket.userData.warRoomHansHearthSide).toBe('service-aisle');
      } finally {
        stage.release();
      }
    });
  }

  it('la puerta de servicio ocupa un tramo independiente de muro, lejos de la chimenea', () => {
    const door = DOOR_AND_STOPS.WR_ANCHOR_hans_door;
    const hearth = DOOR_AND_STOPS.WR_ANCHOR_hans_hearth;
    expect(Math.hypot(door[0] - hearth[0], door[1] - hearth[1])).toBeGreaterThan(4);
    expect(mantelGap(door[0], door[1])).toBeGreaterThan(3);
    // The left suit is also removed from the entrance bay.
    expect(Math.hypot(door[0] + 6.55, door[1] + 4.2)).toBeGreaterThan(2);
  });

  it('chimenea tangente al muro y armadura derecha fuera del sillón, alfombra y mesita', () => {
    const angle = FIREPLACE.angle;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const x = FIREPLACE.x + sx * FIREPLACE.halfX * cos - sy * FIREPLACE.halfY * sin;
        const y = FIREPLACE.y + sx * FIREPLACE.halfX * sin + sy * FIREPLACE.halfY * cos;
        expect(8.72 - Math.hypot(x, y + 0.72), 'mantel does not fit tower wall')
          .toBeGreaterThan(0.08);
      }
    }
    expect(Math.hypot(RIGHT_ARMOUR.x - LOUNGE.chair[0], RIGHT_ARMOUR.y - LOUNGE.chair[1]))
      .toBeGreaterThan(1.8);
    expect(Math.hypot(RIGHT_ARMOUR.x - LOUNGE.rug[0], RIGHT_ARMOUR.y - LOUNGE.rug[1]))
      .toBeGreaterThan(1.42 + RIGHT_ARMOUR.radius + 0.15);
    expect(Math.hypot(RIGHT_ARMOUR.x - LOUNGE.table[0], RIGHT_ARMOUR.y - LOUNGE.table[1]))
      .toBeGreaterThan(0.55 + RIGHT_ARMOUR.radius + 0.15);
  });

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
