import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitBoardCamera } from './Board3DScene.js';
import { board3DProjectionSnapshot } from './Board3DProjectionDiagnostics.js';
import {
  WAR_ROOM_CANONICAL_CAMERA_VERSION,
  WAR_ROOM_V4_HYBRID_CAMERA_VERSION,
  WAR_ROOM_CANONICAL_PLAY_PITCH,
  WAR_ROOM_V4_HYBRID_PITCH,
} from './Board3DCameraProfiles.js';
import { WAR_ROOM_MOBILE_FRAMING_VERSION } from './WarRoomMobileFraming.js';

function frame({ width, height, whiteSide = true, profile = 'warroom', variant = null, immersive = true }) {
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  fitBoardCamera(camera, width, height, whiteSide, { profile, variant, immersive });
  camera.updateMatrixWorld(true);
  return camera;
}

function elevation(camera) {
  const offset = camera.position.clone().sub(camera.userData.baseTarget);
  return THREE.MathUtils.radToDeg(Math.atan2(offset.y, Math.abs(offset.z)));
}

function assertBoardWithinCanvas(camera) {
  const { corners, squares } = board3DProjectionSnapshot(camera);
  for (const [x, y] of [...corners, ...Object.values(squares)]) {
    expect(Math.abs(x)).toBeLessThanOrEqual(1);
    expect(Math.abs(y)).toBeLessThanOrEqual(1);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('War Room V4 · cámara híbrida, sala y recorrido de Hans', () => {
  for (const whiteSide of [true, false]) {
    it(`desktop ${whiteSide ? 'blancas' : 'negras'}: gana vista de tablero sin importar el encuadre docente`, () => {
      vi.stubGlobal('window', {
        innerWidth: 1440,
        matchMedia: () => ({ matches: false }),
      });
      const props = { width: 1400, height: 730, whiteSide };
      const base = frame(props);
      const v4 = frame({ ...props, variant: 'v4' });
      const school = frame({ ...props, profile: 'classroom' });

      expect(base.userData.framingProfile).toBe(WAR_ROOM_CANONICAL_CAMERA_VERSION);
      expect(v4.userData.framingProfile).toBe(WAR_ROOM_V4_HYBRID_CAMERA_VERSION);
      expect(v4.fov).toBe(base.fov);
      expect(elevation(v4)).toBeGreaterThan(elevation(base) + 3);
      expect(elevation(v4)).toBeLessThan(elevation(school));
      expect(v4.userData.cameraDistance).toBeLessThan(base.userData.cameraDistance);
      expect(v4.userData.cameraDistance).toBeGreaterThan(base.userData.cameraDistance * 0.95);
      expect(v4.userData.baseTarget.y).toBeGreaterThan(1.5);
      expect(v4.userData.baseTarget.y).toBeLessThan(base.userData.baseTarget.y);
      expect(v4.userData.baseTarget.y).not.toBe(school.userData.baseTarget.y);
      expect(Math.atan2(WAR_ROOM_V4_HYBRID_PITCH.cameraY, WAR_ROOM_V4_HYBRID_PITCH.cameraZ))
        .toBeGreaterThan(Math.atan2(WAR_ROOM_CANONICAL_PLAY_PITCH.cameraY, WAR_ROOM_CANONICAL_PLAY_PITCH.cameraZ));
      assertBoardWithinCanvas(v4);

      // Real V4 GLB stage anchors (Blender x,z,-y, root lifted -1.12m):
      // the authored teal service door and fire mouth must remain in the
      // camera's visible interior, including the top of Hans' physical actor.
      const sign = whiteSide ? 1 : -1;
      const hansPoints = [
        [-7.82, -1.12, -1.23], // door floor
        [-7.82, 1.2, -1.23],   // Hans head at the door
        [-6.15, -1.12, -3.95], // hearth floor
        [-6.15, 1.2, -3.95],   // Hans at the fireplace
      ];
      for (const [x, y, z] of hansPoints) {
        const ndc = new THREE.Vector3(x * sign, y, z * sign).project(v4);
        expect(Math.abs(ndc.x), `Hans x at ${x}, ${z}`).toBeLessThan(0.93);
        expect(Math.abs(ndc.y), `Hans y at ${x}, ${z}`).toBeLessThan(0.92);
      }
    });
  }

  it('compact desktop: adapts crop without School-style vertical framing', () => {
    vi.stubGlobal('window', {
      innerWidth: 1024,
      matchMedia: () => ({ matches: false }),
    });
    const camera = frame({ width: 760, height: 680, variant: 'v4' });
    expect(camera.userData.framingProfile).toBe(`${WAR_ROOM_V4_HYBRID_CAMERA_VERSION}-compact`);
    expect(camera.userData.baseTarget.y).toBeGreaterThan(0.8);
    assertBoardWithinCanvas(camera);
  });

  for (const [name, width, height, windowWidth] of [
    ['portrait 390', 374, 813, 390],
    ['landscape 844', 816, 375, 844],
    ['landscape 800', 772, 344, 800],
  ]) {
    for (const whiteSide of [true, false]) {
      it(`móvil ${name} ${whiteSide ? 'blancas' : 'negras'}: conserva encuadre acreditado`, () => {
        vi.stubGlobal('window', {
          innerWidth: windowWidth,
          matchMedia: () => ({ matches: true }),
        });
        const props = { width, height, whiteSide };
        const canonical = frame(props);
        const v4 = frame({ ...props, variant: 'v4' });
        expect(v4.userData.framingProfile).toBe(WAR_ROOM_MOBILE_FRAMING_VERSION);
        expect(v4.fov).toBe(canonical.fov);
        expect(v4.position.toArray()).toEqual(canonical.position.toArray());
        expect(v4.userData.baseTarget.toArray()).toEqual(canonical.userData.baseTarget.toArray());
        assertBoardWithinCanvas(v4);
      });
    }
  }

  it('V1/V2/V3, Duel Room and actual School/Training profiles are unchanged', () => {
    vi.stubGlobal('window', {
      innerWidth: 1440,
      matchMedia: () => ({ matches: false }),
    });
    const props = { width: 1400, height: 730 };
    const canonical = frame(props);
    for (const variant of ['classic', 'v2', 'v3']) {
      const camera = frame({ ...props, variant });
      expect(camera.userData.framingProfile).toBe(WAR_ROOM_CANONICAL_CAMERA_VERSION);
      expect(camera.position.toArray()).toEqual(canonical.position.toArray());
    }
    const duel = frame({ ...props, profile: 'duel' });
    expect(frame({ ...props, profile: 'duel', variant: 'v4' }).position.toArray())
      .toEqual(duel.position.toArray());
    const school = frame({ ...props, profile: 'classroom' });
    expect(school.userData.framingProfile).toBe('classroom-overhead-v2');
    const training = frame({ ...props, profile: 'training-room', variant: 'v4' });
    expect(training.userData.framingProfile).toBe('training-room-overhead-v2');
  });
});
