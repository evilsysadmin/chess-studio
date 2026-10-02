import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { resolveBoard3DCameraFov } from './Board3DConfig.js';
import { buildPiece, disposeObject } from './Board3DPieces.js';
import { fitBoardCamera } from './Board3DScene.js';
import { WAR_ROOM_MOBILE_FRAMING_VERSION } from './WarRoomMobileFraming.js';
import {
  WAR_ROOM_CANONICAL_CAMERA_FOV,
  WAR_ROOM_CANONICAL_CAMERA_VERSION,
  WAR_ROOM_CANONICAL_PLAY_PITCH,
} from './Board3DCameraProfiles.js';

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
    fitBoardCamera(camera, 1185, 730, true, { profile: 'warroom' });

    const nearHeight = projectedHeight(camera, 3.5);
    const farHeight = projectedHeight(camera, -3.5);
    const apparentScaleRatio = nearHeight / farHeight;

    expect(resolveBoard3DCameraFov(1185 / 730)).toBe(22);
    expect(camera.fov).toBe(22);
    // The shared mobile pitch makes near/far apparent height essentially equal;
    // tolerate either side of 1 while keeping perspective compression bounded.
    expect(apparentScaleRatio).toBeGreaterThan(0.98);
    expect(apparentScaleRatio).toBeLessThan(1.16);
  });

  it('usa exactamente la cámara v4 canónica en V1/V2/V3/V4 desktop y landscape móvil', () => {
    const elevation = (camera) => {
      const offset = camera.position.clone().sub(camera.userData.baseTarget);
      return THREE.MathUtils.radToDeg(Math.atan2(offset.y, Math.abs(offset.z)));
    };

    vi.stubGlobal('window', {
      innerWidth: 1440,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    let desktopElevation;
    try {
      const desktop = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      fitBoardCamera(desktop, 1400, 730, true, { profile: 'warroom' });
      expect(desktop.userData.framingProfile).toBe(WAR_ROOM_CANONICAL_CAMERA_VERSION);
      expect(desktop.fov).toBe(WAR_ROOM_CANONICAL_CAMERA_FOV);
      desktopElevation = elevation(desktop);
    } finally {
      vi.unstubAllGlobals();
    }

    vi.stubGlobal('window', {
      innerWidth: 851,
      matchMedia: vi.fn().mockImplementation((query) => ({ matches: query === '(pointer: coarse)' })),
    });

    try {
      const mobile = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      fitBoardCamera(mobile, 851, 393, true, { profile: 'warroom' });
      const mobileElevation = elevation(mobile);
      expect(mobile.fov).toBe(WAR_ROOM_CANONICAL_CAMERA_FOV);
      expect(mobile.userData.framingProfile).toBe(WAR_ROOM_MOBILE_FRAMING_VERSION);
      expect(desktopElevation).toBeCloseTo(mobileElevation, 6);
      expect(mobileElevation).toBeCloseTo(
        THREE.MathUtils.radToDeg(Math.atan2(
          WAR_ROOM_CANONICAL_PLAY_PITCH.cameraY,
          WAR_ROOM_CANONICAL_PLAY_PITCH.cameraZ,
        )),
        6,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('acerca el contrato War Room en inmersión desktop sin cambiar su framing móvil', () => {
    vi.stubGlobal('window', {
      innerWidth: 1440,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    try {
      const normal = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      const immersive = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      fitBoardCamera(normal, 1440, 900, true, { profile: 'warroom' });
      fitBoardCamera(immersive, 1440, 900, true, { profile: 'warroom', immersive: true });
      expect(immersive.userData.cameraDistance).toBeCloseTo(normal.userData.cameraDistance * 0.91, 6);
    } finally {
      vi.unstubAllGlobals();
    }

    vi.stubGlobal('window', {
      innerWidth: 851,
      matchMedia: vi.fn().mockImplementation((query) => ({ matches: query === '(pointer: coarse)' })),
    });

    try {
      const normalMobile = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      const immersiveMobile = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      fitBoardCamera(normalMobile, 851, 393, true, { profile: 'warroom' });
      fitBoardCamera(immersiveMobile, 851, 393, true, { profile: 'warroom', immersive: true });
      expect(immersiveMobile.userData.cameraDistance).toBeCloseTo(normalMobile.userData.cameraDistance, 6);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('acerca Duel Room sin cambiar la óptica canónica de War Room', () => {
    const assertSameOptics = (warRoom, duel) => {
      expect(duel.fov).toBe(warRoom.fov);
      expect(duel.userData.baseTarget.toArray()).toEqual(warRoom.userData.baseTarget.toArray());
      const warDirection = warRoom.position.clone().sub(warRoom.userData.baseTarget).normalize();
      const duelDirection = duel.position.clone().sub(duel.userData.baseTarget).normalize();
      expect(duelDirection.x).toBeCloseTo(warDirection.x, 6);
      expect(duelDirection.y).toBeCloseTo(warDirection.y, 6);
      expect(duelDirection.z).toBeCloseTo(warDirection.z, 6);
    };

    vi.stubGlobal('window', {
      innerWidth: 1440,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    try {
      const warRoom = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      const duel = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      fitBoardCamera(warRoom, 1440, 900, true, { profile: 'warroom', immersive: true });
      fitBoardCamera(duel, 1440, 900, true, { profile: 'duel', immersive: true });
      assertSameOptics(warRoom, duel);
      expect(duel.userData.cameraDistance).toBeCloseTo(warRoom.userData.cameraDistance * 0.91, 6);
    } finally {
      vi.unstubAllGlobals();
    }

    vi.stubGlobal('window', {
      innerWidth: 851,
      matchMedia: vi.fn().mockImplementation((query) => ({ matches: query === '(pointer: coarse)' })),
    });

    try {
      const warRoom = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      const duel = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      fitBoardCamera(warRoom, 851, 393, true, { profile: 'warroom', immersive: true });
      fitBoardCamera(duel, 851, 393, true, { profile: 'duel', immersive: true });
      assertSameOptics(warRoom, duel);
      expect(duel.userData.cameraDistance).toBeCloseTo(warRoom.userData.cameraDistance * 0.96, 6);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('adapta sólo distancia y target en landscape móvil sin cambiar lente ni pitch', () => {
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    vi.stubGlobal('window', {
      innerWidth: 851,
      matchMedia: vi.fn().mockImplementation((query) => ({ matches: query === '(pointer: coarse)' })),
    });

    try {
      fitBoardCamera(camera, 851, 393, true, { profile: 'warroom' });
      const target = camera.userData.baseTarget;
      const offset = camera.position.clone().sub(target);
      const elevation = Math.atan2(offset.y, Math.abs(offset.z));

      expect(camera.fov).toBe(WAR_ROOM_CANONICAL_CAMERA_FOV);
      expect(camera.userData.framingProfile).toBe(WAR_ROOM_MOBILE_FRAMING_VERSION);
      expect(camera.userData.cameraDistance).toBeGreaterThan(20);
      expect(camera.userData.cameraDistance).toBeLessThan(28);
      expect(THREE.MathUtils.radToDeg(elevation)).toBeCloseTo(
        THREE.MathUtils.radToDeg(Math.atan2(
          WAR_ROOM_CANONICAL_PLAY_PITCH.cameraY,
          WAR_ROOM_CANONICAL_PLAY_PITCH.cameraZ,
        )),
        6,
      );
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

  it('mantiene la cámara táctica genérica fuera del dominio War Room', () => {
    vi.stubGlobal('window', {
      innerWidth: 1440,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    try {
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      fitBoardCamera(camera, 1400, 730, true, { profile: 'tactical' });
      expect(camera.userData.framingProfile).toContain('shared-play-pitch-v1');
      expect(camera.userData.framingProfile).not.toBe(WAR_ROOM_CANONICAL_CAMERA_VERSION);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('conserva el resolver legado para superficies no gobernadas por el contrato War Room', () => {
    expect(resolveBoard3DCameraFov(1.8)).toBe(22);
    expect(resolveBoard3DCameraFov(1.1)).toBe(32);
    expect(resolveBoard3DCameraFov(1.16, { mobile: true })).toBe(34);
  });
});