import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { resolveBoard3DCameraFov } from './Board3DConfig.js';
import { buildPiece, disposeObject } from './Board3DPieces.js';
import { fitBoardCamera } from './Board3DScene.js';

function worldSize(root) {
  root.updateMatrixWorld(true);
  const size = new THREE.Vector3();
  new THREE.Box3().setFromObject(root).getSize(size);
  return size;
}

function projectedHeight(camera, z, height = 1) {
  camera.updateMatrixWorld(true);
  const bottom = new THREE.Vector3(0, 0.12, z).project(camera);
  const top = new THREE.Vector3(0, 0.12 + height, z).project(camera);
  return Math.abs(top.y - bottom.y);
}

describe('Board3D piece scale parity', () => {
  it('construye la misma geometría física para blancas y negras por tipo', () => {
    for (const type of ['p', 'n', 'b', 'r', 'q']) {
      const white = buildPiece(type, 'w', 'studio', false);
      const black = buildPiece(type, 'b', 'studio', false);
      const whiteSize = worldSize(white);
      const blackSize = worldSize(black);

      expect(whiteSize.x, `${type}: ancho white/black`).toBeCloseTo(blackSize.x, 6);
      expect(whiteSize.y, `${type}: alto white/black`).toBeCloseTo(blackSize.y, 6);
      expect(whiteSize.z, `${type}: fondo white/black`).toBeCloseTo(blackSize.z, 6);

      disposeObject(white);
      disposeObject(black);
    }
  });

  it('usa lente desktop más larga para que primera y última fila no parezcan sets de escalas distintas', () => {
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    fitBoardCamera(camera, 1185, 730, true);

    const nearHeight = projectedHeight(camera, 3.5);
    const farHeight = projectedHeight(camera, -3.5);
    const apparentScaleRatio = nearHeight / farHeight;

    expect(resolveBoard3DCameraFov(1185 / 730)).toBe(29);
    expect(camera.fov).toBe(29);
    expect(apparentScaleRatio).toBeGreaterThan(1);
    expect(apparentScaleRatio).toBeLessThan(1.33);
  });

  it('conserva el FOV móvil existente y sólo comprime perspectiva en desktop', () => {
    expect(resolveBoard3DCameraFov(1.8)).toBe(29);
    expect(resolveBoard3DCameraFov(1.1)).toBe(32);
    expect(resolveBoard3DCameraFov(0.46, { mobile: true })).toBe(40);
  });
});
