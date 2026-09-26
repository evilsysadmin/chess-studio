import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
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

    expect(resolveBoard3DCameraFov(1185 / 730)).toBe(22);
    expect(camera.fov).toBe(22);
    expect(apparentScaleRatio).toBeGreaterThan(1);
    expect(apparentScaleRatio).toBeLessThan(1.16);
  });

  it('pica sólo la V1 clásica en desktop ancho y conserva eje horizontal', () => {
    const classic = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    const v2 = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

    fitBoardCamera(classic, 1185, 730, true, { variant: 'classic' });
    fitBoardCamera(v2, 1185, 730, true, { variant: 'v2' });

    const elevationDeg = (camera) => {
      const target = camera.userData.baseTarget;
      const offset = camera.position.clone().sub(target);
      return THREE.MathUtils.radToDeg(Math.atan2(offset.y, Math.abs(offset.z)));
    };

    const classicElevation = elevationDeg(classic);
    const v2Elevation = elevationDeg(v2);

    expect(classic.userData.framingProfile).toBe('classic-desktop-overhead-v1');
    expect(classicElevation).toBeGreaterThan(34);
    expect(classicElevation).toBeLessThan(36);
    expect(classicElevation - v2Elevation).toBeGreaterThan(4);
    expect(v2Elevation).toBeLessThan(31);
    expect(classic.userData.baseTarget.y).toBeLessThan(v2.userData.baseTarget.y);
    expect(classic.position.x).toBeCloseTo(classic.userData.baseTarget.x, 8);
  });

  it('sube la cámara solo en landscape móvil para separar visualmente las filas', () => {
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    vi.stubGlobal('window', {
      innerWidth: 851,
      matchMedia: vi.fn().mockImplementation((query) => ({ matches: query === '(pointer: coarse)' })),
    });

    try {
      fitBoardCamera(camera, 851, 393, true);
      const target = camera.userData.baseTarget;
      const offset = camera.position.clone().sub(target);
      const elevation = Math.atan2(offset.y, Math.abs(offset.z));

      expect(camera.fov).toBe(34);
      expect(camera.userData.framingProfile).toBe('mobile-v5-landscape-overhead');
      expect(camera.userData.cameraDistance).toBeLessThan(16);
      expect(THREE.MathUtils.radToDeg(elevation)).toBeGreaterThan(39);
      expect(Math.abs(target.z)).toBeLessThanOrEqual(0.08);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('comprime también la perspectiva móvil sin reutilizar la lente desktop', () => {
    expect(resolveBoard3DCameraFov(1.8)).toBe(22);
    expect(resolveBoard3DCameraFov(1.1)).toBe(32);
    expect(resolveBoard3DCameraFov(1.16, { mobile: true })).toBe(34);
  });
});