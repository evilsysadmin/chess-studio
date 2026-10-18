import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitBoardCamera } from './Board3DScene.js';
import { board3DProjectionSnapshot } from './Board3DProjectionDiagnostics.js';
import { WAR_ROOM_CANONICAL_CAMERA_VERSION } from './Board3DCameraProfiles.js';
import { WAR_ROOM_MOBILE_FRAMING_VERSION } from './WarRoomMobileFraming.js';

const EXPERIMENT_VERSION = 'warroom-v4-school-angle-experiment-v1';

function cameraFor({ width, height, whiteSide = true, profile = 'warroom', variant, immersive = true }) {
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  fitBoardCamera(camera, width, height, whiteSide, { profile, variant, immersive });
  camera.updateMatrixWorld(true);
  return camera;
}

afterEach(() => vi.unstubAllGlobals());

describe('War Room V4 · prueba aislada de encuadre docente', () => {
  for (const viewport of [
    { name: 'desktop', width: 1400, height: 730, windowWidth: 1440, coarse: false },
    { name: 'teléfono vertical', width: 374, height: 813, windowWidth: 390, coarse: true },
  ]) {
    for (const whiteSide of [true, false]) {
      it(`V4 reproduce la cámara de la Escuela en ${viewport.name} con ${whiteSide ? 'blancas' : 'negras'}`, () => {
        vi.stubGlobal('window', {
          innerWidth: viewport.windowWidth,
          matchMedia: () => ({ matches: viewport.coarse }),
        });

        const shared = { width: viewport.width, height: viewport.height, whiteSide };
        const school = cameraFor({ ...shared, profile: 'classroom' });
        const v4 = cameraFor({ ...shared, profile: 'warroom', variant: 'v4' });

        expect(v4.userData.framingProfile).toBe(EXPERIMENT_VERSION);
        expect(v4.fov).toBe(school.fov);
        expect(v4.position.toArray()).toEqual(school.position.toArray());
        expect(v4.userData.baseTarget.toArray()).toEqual(school.userData.baseTarget.toArray());
        expect(v4.userData.cameraDistance).toBeCloseTo(school.userData.cameraDistance, 6);

        // The closer classroom angle must still keep every playable square
        // inside the canvas for both board orientations.
        const { corners, squares } = board3DProjectionSnapshot(v4);
        for (const [x, y] of [...corners, ...Object.values(squares)]) {
          expect(Math.abs(x)).toBeLessThanOrEqual(1);
          expect(Math.abs(y)).toBeLessThanOrEqual(1);
        }
      });
    }
  }

  it('V1/V2/V3 and the Duel Room retain their existing camera contract', () => {
    vi.stubGlobal('window', {
      innerWidth: 1440,
      matchMedia: () => ({ matches: false }),
    });
    const shared = { width: 1400, height: 730 };
    const baseline = cameraFor(shared);

    for (const variant of ['classic', 'v2', 'v3']) {
      const camera = cameraFor({ ...shared, variant });
      expect(camera.userData.framingProfile).toBe(WAR_ROOM_CANONICAL_CAMERA_VERSION);
      expect(camera.fov).toBe(baseline.fov);
      expect(camera.position.toArray()).toEqual(baseline.position.toArray());
      expect(camera.userData.baseTarget.toArray()).toEqual(baseline.userData.baseTarget.toArray());
    }

    const duelBaseline = cameraFor({ ...shared, profile: 'duel' });
    const duelWithV4Argument = cameraFor({ ...shared, profile: 'duel', variant: 'v4' });
    expect(duelWithV4Argument.position.toArray()).toEqual(duelBaseline.position.toArray());
    const training = cameraFor({ ...shared, profile: 'training-room', variant: 'v4' });
    expect(training.userData.framingProfile).toBe('training-room-overhead-v2');
  });

  it('mantiene el encuadre móvil canónico para V1/V2/V3', () => {
    vi.stubGlobal('window', {
      innerWidth: 390,
      matchMedia: () => ({ matches: true }),
    });
    for (const variant of ['classic', 'v2', 'v3']) {
      const camera = cameraFor({ width: 374, height: 813, variant });
      expect(camera.userData.framingProfile).toBe(WAR_ROOM_MOBILE_FRAMING_VERSION);
    }
  });
});
