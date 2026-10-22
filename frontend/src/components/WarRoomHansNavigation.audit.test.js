import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { explainWarRoomHansBlockedRoute, warRoomHansBuildSafeRoute } from './WarRoomHansNavigation.js';

function sampleRoom() {
  const root = new THREE.Group();
  const parent = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(16.5, .09, 13.6), new THREE.MeshBasicMaterial());
  floor.name = 'war-room-castle-floor-slab';
  floor.position.y = -.305;
  root.add(parent, floor);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(3.35, 1.3, 1.05), new THREE.MeshBasicMaterial());
  desk.name = 'war-room-teutonic-command-desk-v28';
  desk.position.set(0, .65, -5.8);
  root.add(desk);
  root.updateMatrixWorld(true);
  return { root, parent, floor };
}

describe('Hans route rejection evidence', () => {
  it('identifies the actual padded desk when the target falls inside it', () => {
    const { floor, parent } = sampleRoom();
    const home = new THREE.Vector3(-7.1, -.34, .2);
    const target = new THREE.Vector3(0, -.34, -5.8);
    expect(warRoomHansBuildSafeRoute(floor, parent, home, target)).toEqual([]);
    const reason = explainWarRoomHansBlockedRoute(floor, parent, home, target);
    expect(reason.targetInside).toContain('war-room-teutonic-command-desk-v28');
    expect(reason.originInside).toEqual([]);
    expect(reason.candidateCount).toBeGreaterThan(0);
    expect(reason.blockedBy['war-room-teutonic-command-desk-v28']).toBeGreaterThan(0);
  });

  it('attributes central no-go targets to the board instead of declaring success', () => {
    const { floor, parent } = sampleRoom();
    const home = new THREE.Vector3(-7.1, -.34, .2);
    const destination = new THREE.Vector3(0, -.34, 0);
    expect(warRoomHansBuildSafeRoute(floor, parent, home, destination)).toEqual([]);
    const reason = explainWarRoomHansBlockedRoute(floor, parent, home, destination);
    expect(reason.targetInside).toContain('board-keepout');
    expect(reason.blockedBy['board-keepout']).toBeGreaterThan(0);
  });
});
