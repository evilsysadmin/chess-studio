import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  TRAIL_RENDER_HOT_PATH_VERSION,
  createTrailBishopAimLine,
  createTrailInstancedTrack,
  nearestTrailObject,
  updateTrailBishopAimLine,
} from './pawnTrailblazerRenderHotPath.js';

describe('Pawn Trailblazer render hot path', () => {
  it('batches the 30x5 checkerboard into two instanced draw meshes', () => {
    const track = createTrailInstancedTrack({
      rows: 30,
      lanes: 5,
      tileSize: 1.45,
      playerZ: 4.6,
      laneX: (lane) => (lane - 2) * 1.45,
    });

    expect(track.tileCount).toBe(150);
    expect(track.drawMeshes).toBe(2);
    expect(track.group.children).toHaveLength(2);
    expect(track.light).toBeInstanceOf(THREE.InstancedMesh);
    expect(track.dark).toBeInstanceOf(THREE.InstancedMesh);
    expect(track.light.count + track.dark.count).toBe(150);
    expect(track.group.userData.trailTrackHotPath).toBe(TRAIL_RENDER_HOT_PATH_VERSION);

    const before = new THREE.Matrix4();
    const after = new THREE.Matrix4();
    track.light.getMatrixAt(0, before);
    track.advance(0.5);
    track.light.getMatrixAt(0, after);
    expect(after.elements[14] - before.elements[14]).toBeCloseTo(0.5, 5);
  });

  it('updates one bishop aim line in place instead of rebuilding geometry/material', () => {
    const parent = new THREE.Group();
    const line = createTrailBishopAimLine(parent);
    const geometry = line.geometry;
    const material = line.material;
    const positionArray = geometry.getAttribute('position').array;
    const distanceArray = geometry.getAttribute('lineDistance').array;

    updateTrailBishopAimLine(line, { startX: -1.45, startZ: -8, targetX: 1.45, targetZ: 4.6 });
    expect(line.geometry).toBe(geometry);
    expect(line.material).toBe(material);
    expect(geometry.getAttribute('position').array).toBe(positionArray);
    expect(geometry.getAttribute('lineDistance').array).toBe(distanceArray);
    expect(positionArray[0]).toBeCloseTo(-1.45, 5);
    expect(positionArray[3]).toBeCloseTo(1.45, 5);
    expect(distanceArray[1]).toBeGreaterThan(12);

    updateTrailBishopAimLine(line, { startX: 0, startZ: -4, targetX: 0, targetZ: 4.6 });
    expect(line.geometry).toBe(geometry);
    expect(line.material).toBe(material);
    expect(positionArray[0]).toBe(0);
    expect(positionArray[2]).toBe(-4);
    expect(line.userData.trailBishopAimHotPath).toBe(TRAIL_RENDER_HOT_PATH_VERSION);
  });

  it('finds the nearest eligible object without filter/sort copies', () => {
    const objects = [
      { id: 1, lane: 2, kind: 'enemy', z: 2.9 },
      { id: 2, lane: 2, kind: 'power', z: 4.1 },
      { id: 3, lane: 2, kind: 'enemy', z: 3.8 },
      { id: 4, lane: 1, kind: 'enemy', z: 4.4 },
    ];
    const snapshot = objects.slice();

    expect(nearestTrailObject(objects, { lane: 2, minZ: 2, maxZ: 4.2 })?.id).toBe(2);
    expect(nearestTrailObject(objects, { lane: 2, kind: 'enemy', minZ: 2, maxZ: 4.2 })?.id).toBe(3);
    expect(objects).toEqual(snapshot);
  });
});
