import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitBoardCamera } from './Board3DScene.js';
import {
  BOARD3D_PLAY_SURFACE_Y,
  applyBoard3DProjectionDiagnostics,
  board3DProjectionSnapshot,
  projectWorldPointNdc,
  readBoard3DViewProjection,
} from './Board3DProjectionDiagnostics.js';
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

      // Exact Blender V4 oculus apex: center (0, 7.56, 2.62), vertical
      // radius 1.70, room root -1.12. Keep its upper rim in the actual
      // perspective frustum, not merely the chessboard's 64 squares.
      const oculusApex = new THREE.Vector3(0, 3.20, whiteSide ? -7.56 : 7.56).project(v4);
      expect(oculusApex.y, 'V4 upper lunar oculus cropped').toBeLessThan(0.995);
      expect(oculusApex.y, 'V4 oculus no longer prominent').toBeGreaterThan(0.85);

      // V4's real Blender door and hearth anchors (x,z,-y, room root -1.12).
      // A previous stale test asserted an obsolete door location and allowed
      // the actual teal doorway to slip off the edge of the desktop capture.
      const sign = whiteSide ? 1 : -1;
      const visiblePoints = [
        [-7.38, -1.12, 1.37], // actual doorway threshold, not old -7.82/1.23
        [-7.38, 1.2, 1.37],   // Hans' head entering by the door
        [-7.38, 2.65, 1.37],  // top of the full teal portal
        [-6.28, -1.12, -3.05], // hearth working aisle
        [-6.28, 1.2, -3.05],  // Hans standing by the fireplace
      ];
      for (const [x, y, z] of visiblePoints) {
        const ndc = new THREE.Vector3(x * sign, y, z * sign).project(v4);
        expect(Math.abs(ndc.x), `V4 door/Hans outside frame at ${x},${z}`).toBeLessThan(0.9);
        expect(Math.abs(ndc.y), `V4 door/Hans vertical crop at ${x},${z}`).toBeLessThan(0.93);
      }
    });
  }

  for (const whiteSide of [true, false]) {
    it(`desktop resize ${whiteSide ? 'blancas' : 'negras'}: actual published projection follows the camera and returns to its first pose`, () => {
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      const canvas = { dataset: {} };
      // Realistic drawable board sizes; the 16:10 laptop and 4:3 compact
      // viewport cross the wide/compact threshold without touching mobile.
      const viewports = [
        [1400, 880, 1440], // starting desktop (wide)
        [1220, 685, 1280], // short laptop (wide)
        [980, 730, 1024],  // compact desktop (not coarse pointer)
        [2480, 1020, 2560], // ultrawide
        [1400, 880, 1440], // restore exactly, e.g. resized window
      ];
      let firstPublished = null;
      for (const [width, height, windowWidth] of viewports) {
        vi.stubGlobal('window', {
          innerWidth: windowWidth,
          matchMedia: () => ({ matches: false }),
        });
        fitBoardCamera(camera, width, height, whiteSide, {
          profile: 'warroom',
          variant: 'v4',
          immersive: true,
        });
        camera.updateMatrixWorld(true);
        // The canvas matrix is what runtime interaction and E2E diagnostics
        // actually consume; merely projecting via camera.project() can miss
        // a stale attribute after resize, rotation or a camera-profile swap.
        expect(applyBoard3DProjectionDiagnostics(canvas, camera)).toBe(1);
        const matrix = readBoard3DViewProjection(canvas);
        expect(matrix).toHaveLength(16);
        const { corners } = board3DProjectionSnapshot(camera);
        const worldCorners = [
          [-4, BOARD3D_PLAY_SURFACE_Y, -4],
          [4, BOARD3D_PLAY_SURFACE_Y, -4],
          [-4, BOARD3D_PLAY_SURFACE_Y, 4],
          [4, BOARD3D_PLAY_SURFACE_Y, 4],
        ];
        for (let i = 0; i < corners.length; i += 1) {
          const ndc = projectWorldPointNdc(matrix, worldCorners[i]);
          expect(ndc).not.toBeNull();
          expect(ndc.x).toBeCloseTo(corners[i][0], 3);
          expect(ndc.y).toBeCloseTo(corners[i][1], 3);
          expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
        }
        if (width / height >= 1.42) {
          const apex = projectWorldPointNdc(matrix, [0, 3.20, whiteSide ? -7.56 : 7.56]);
          expect(apex, 'oculus apex behind hybrid camera').not.toBeNull();
          expect(apex.y, 'wide desktop cropped the lunar upper rim').toBeLessThan(0.995);
          expect(apex.y, 'oculus disappeared from wide composition').toBeGreaterThan(0.85);
        }
        if (firstPublished === null) firstPublished = canvas.dataset.board3dViewProjection;
      }
      expect(canvas.dataset.board3dViewProjection).toBe(firstPublished);
      // No camera motion means no needless per-frame dataset rewrite.
      expect(applyBoard3DProjectionDiagnostics(canvas, camera)).toBe(0);
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
