import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BOARD3D_PROJECTION_VERSION,
  applyBoard3DProjectionDiagnostics,
  board3DProjectionSnapshot,
  projectWorldPointNdc,
  readBoard3DViewProjection,
} from './Board3DProjectionDiagnostics.js';

function overheadCamera() {
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 20, 0.001);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

function fakeCanvas() {
  const events = [];
  return { dataset: {}, events, dispatchEvent: (event) => events.push(event.type) };
}

describe('Board3DProjectionDiagnostics', () => {
  it('proyecta esquinas y 64 casillas con la orientación de blancas', () => {
    const snapshot = board3DProjectionSnapshot(overheadCamera());
    expect(snapshot.version).toBe(BOARD3D_PROJECTION_VERSION);
    expect(snapshot.corners).toHaveLength(4);
    expect(Object.keys(snapshot.squares)).toHaveLength(64);
    // Blancas abajo: a1 a la izquierda y abajo, h8 a la derecha y arriba.
    expect(snapshot.squares.a1[0]).toBeLessThan(0);
    expect(snapshot.squares.a1[1]).toBeLessThan(0);
    expect(snapshot.squares.h8[0]).toBeGreaterThan(0);
    expect(snapshot.squares.h8[1]).toBeGreaterThan(0);
  });

  it('sólo reescribe y avisa cuando cambia la cámara', () => {
    const camera = overheadCamera();
    const canvas = fakeCanvas();
    expect(applyBoard3DProjectionDiagnostics(canvas, camera)).toBe(1);
    expect(applyBoard3DProjectionDiagnostics(canvas, camera)).toBe(0);
    camera.position.set(0, 25, 0.001);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    expect(applyBoard3DProjectionDiagnostics(canvas, camera)).toBe(1);
    expect(canvas.events).toEqual(['board3d-projection', 'board3d-projection']);
  });

  it('la matriz publicada proyecta igual que la cámara de Three', () => {
    const camera = overheadCamera();
    const canvas = fakeCanvas();
    applyBoard3DProjectionDiagnostics(canvas, camera);
    const elements = readBoard3DViewProjection(canvas);
    const point = [2.5, 1.56, -3.5];
    const expected = new THREE.Vector3(...point).project(camera);
    const actual = projectWorldPointNdc(elements, point);
    expect(actual.x).toBeCloseTo(expected.x, 4);
    expect(actual.y).toBeCloseTo(expected.y, 4);
  });

  it('rechaza matrices inválidas', () => {
    expect(projectWorldPointNdc(null, [0, 0, 0])).toBeNull();
    expect(projectWorldPointNdc([1, 2, 3], [0, 0, 0])).toBeNull();
    expect(readBoard3DViewProjection({ dataset: {} })).toBeNull();
  });
});
