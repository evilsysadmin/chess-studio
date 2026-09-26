import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { resolveBoard3DCameraFov } from './Board3DConfig.js';
import { addClassicDesktopPieceHitTarget, buildPiece, disposeObject } from './Board3DPieces.js';
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

  it('usa un picado propio en War Room V1 sin mover la cámara táctica de V2/V3', () => {
    vi.stubGlobal('window', {
      innerWidth: 1440,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    try {
      const classic = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      const tactical = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      fitBoardCamera(classic, 1400, 730, true, { profile: 'classic' });
      fitBoardCamera(tactical, 1400, 730, true, { profile: 'tactical' });

      const classicOffset = classic.position.clone().sub(classic.userData.baseTarget);
      const tacticalOffset = tactical.position.clone().sub(tactical.userData.baseTarget);
      const classicElevation = THREE.MathUtils.radToDeg(Math.atan2(classicOffset.y, Math.abs(classicOffset.z)));
      const tacticalElevation = THREE.MathUtils.radToDeg(Math.atan2(tacticalOffset.y, Math.abs(tacticalOffset.z)));

      expect(classic.userData.framingProfile).toBe('classic-overhead-v1');
      expect(classicElevation).toBeGreaterThan(39);
      expect(classicElevation).toBeGreaterThan(tacticalElevation + 8);
      expect(classic.fov).toBe(tactical.fov);
    } finally {
      vi.unstubAllGlobals();
    }
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

  it('hace que la reina tenga una silueta inequívocamente más alta que el alfil', () => {
    const queen = buildPiece('q', 'w', 'studio', false);
    const bishop = buildPiece('b', 'w', 'studio', false);
    const queenSize = worldSize(queen);
    const bishopSize = worldSize(bishop);
    const queenParts = [];
    queen.traverse((object) => {
      if (object.userData?.queenPart) queenParts.push(object.userData.queenPart);
    });

    expect(queen.userData.board3DQueenSilhouetteVersion).toBe('royal-crown-v2');
    expect(queen.userData.board3DQueenCrownProfile).toBe('eight-point-flared-v1');
    expect(queenSize.y).toBeGreaterThan(bishopSize.y * 1.06);
    expect(queenParts.filter((part) => part === 'crown-point')).toHaveLength(8);
    expect(queenParts.filter((part) => part === 'crown-orb')).toHaveLength(8);
    expect(queenParts).toContain('finial');

    disposeObject(queen);
    disposeObject(bishop);
  });

  it('añade ayuda de selección desktop sólo cuando classic la solicita', () => {
    const piece = buildPiece('p', 'w', 'studio', false);
    addClassicDesktopPieceHitTarget(piece, 'e2', false);
    expect(piece.getObjectByProperty('userData.pieceHitTarget', 'classic-desktop-base-v1')).toBeUndefined();

    addClassicDesktopPieceHitTarget(piece, 'e2', true);
    const target = piece.children.find((child) => child.userData?.pieceHitTarget === 'classic-desktop-base-v1');
    expect(target?.userData.square).toBe('e2');
    expect(target?.material?.colorWrite).toBe(false);

    disposeObject(piece);
  });

  it('comprime también la perspectiva móvil sin reutilizar la lente desktop', () => {
    expect(resolveBoard3DCameraFov(1.8)).toBe(22);
    expect(resolveBoard3DCameraFov(1.1)).toBe(32);
    expect(resolveBoard3DCameraFov(1.16, { mobile: true })).toBe(34);
  });
});