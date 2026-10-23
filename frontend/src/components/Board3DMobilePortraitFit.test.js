import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fitBoardCamera } from './Board3DScene.js';
import { board3DProjectionSnapshot } from './Board3DProjectionDiagnostics.js';
import {
  BOARD3D_LEGACY_MOBILE_FRAMING_VERSION,
  WAR_ROOM_MOBILE_FRAMING_VERSION,
} from './WarRoomMobileFraming.js';

// Código Rojo GP-2 (#34): con la cámara REAL (fitBoardCamera) el tablero
// renderizado ocupa el 88–100 % del ancho del viewport en teléfonos verticales
// y las 64 casillas quedan dentro del canvas. Los tamaños de canvas son los que
// mide Playwright en la War Room inmersiva (viewport menos el marco del shell).
const PHONES = [
  { viewport: [360, 640], canvas: [344, 609] },
  { viewport: [390, 844], canvas: [374, 813] },
  { viewport: [412, 915], canvas: [396, 884] },
  { viewport: [430, 932], canvas: [414, 901] },
  // Entrenamiento / puzzles: canvas casi cuadrado bajo la cabecera (GP-7).
  { viewport: [390, 844], canvas: [367, 383], profile: 'classic', immersive: false },
  { viewport: [412, 690], canvas: [389, 406], profile: 'classic', immersive: false },
  { viewport: [360, 640], canvas: [336, 350], profile: 'classic', immersive: false },
];

describe('Combat inspection · opt-in optical framing', () => {
  const previousWindow = globalThis.window;
  afterEach(() => { globalThis.window = previousWindow; });

  for (const [width, height] of [[360, 640], [390, 844], [430, 932]]) {
    it(`${width}x${height}: a closer view that restores the original camera`, () => {
      globalThis.window = { matchMedia: () => ({ matches: true }), innerWidth: width, innerHeight: height };
      const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 200);
      const opts = { profile: 'warroom', variant: 'combat-ops', immersive: true };
      fitBoardCamera(camera, width, height, true, opts);
      camera.updateMatrixWorld(true);
      const normal = board3DProjectionSnapshot(camera);
      const initialPosition = camera.position.clone();
      const initialFraming = camera.userData.framingProfile;
      const projectedWidth = ({ corners }) =>
        (Math.max(...corners.map(([x]) => x)) - Math.min(...corners.map(([x]) => x))) / 2;

      fitBoardCamera(camera, width, height, true, { ...opts, inspectionPreview: true });
      camera.updateMatrixWorld(true);
      expect(camera.userData.framingProfile).toBe('combat-inspection-portrait-v1');
      const focused = board3DProjectionSnapshot(camera);
      expect(projectedWidth(focused)).toBeGreaterThan(projectedWidth(normal) * 1.08);
      for (const square of ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2']) {
        const [x, y] = focused.squares[square];
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(Math.abs(x)).toBeLessThan(1.1);
        expect(Math.abs(y)).toBeLessThan(1.1);
      }
      fitBoardCamera(camera, width, height, true, opts);
      expect(camera.userData.framingProfile).toBe(initialFraming);
      expect(camera.position.distanceTo(initialPosition)).toBeLessThan(1e-6);
    });
  }

  it('never affects desktop Combat, playable War Room, or Duel Room', () => {
    globalThis.window = { matchMedia: () => ({ matches: false }), innerWidth: 1440, innerHeight: 900 };
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    for (const options of [
      { profile: 'warroom', variant: 'combat-ops' },
      { profile: 'warroom', variant: 'v4' },
      { profile: 'duel', variant: 'duel' },
    ]) {
      fitBoardCamera(camera, 1440, 900, true, { ...options, inspectionPreview: true });
      expect(camera.userData.framingProfile).not.toBe('combat-inspection-portrait-v1');
    }
    globalThis.window = { matchMedia: () => ({ matches: true }), innerWidth: 390, innerHeight: 844 };
    fitBoardCamera(camera, 390, 844, true, { profile: 'warroom', variant: 'v4', inspectionPreview: true });
    expect(camera.userData.framingProfile).not.toBe('combat-inspection-portrait-v1');
  });
});

describe('War Room · encaje del tablero en teléfono vertical', () => {
  let previousWindow;
  beforeEach(() => { previousWindow = globalThis.window; });
  afterEach(() => { globalThis.window = previousWindow; });

  for (const { viewport: [vw, vh], canvas: [cw, ch], profile = 'warroom', immersive = true } of PHONES) {
    it(`${vw}x${vh} · canvas ${cw}x${ch}: tablero al 88–100 % del ancho y 64 casillas en pantalla`, () => {
      globalThis.window = { matchMedia: () => ({ matches: true }), innerWidth: vw, innerHeight: vh };
      const camera = new THREE.PerspectiveCamera(40, cw / ch, 0.1, 200);
      fitBoardCamera(camera, cw, ch, true, { profile, immersive });
      camera.updateMatrixWorld();
      expect(camera.userData.framingProfile).toBe(
        profile === 'warroom'
          ? WAR_ROOM_MOBILE_FRAMING_VERSION
          : BOARD3D_LEGACY_MOBILE_FRAMING_VERSION,
      );

      const { corners, squares } = board3DProjectionSnapshot(camera);
      const xs = corners.map(([x]) => x);
      const widthPx = ((Math.max(...xs) - Math.min(...xs)) / 2) * cw;
      expect(widthPx / vw).toBeGreaterThanOrEqual(0.88);
      expect(widthPx / vw).toBeLessThanOrEqual(1);
      for (const [x, y] of [...corners, ...Object.values(squares)]) {
        expect(Math.abs(x)).toBeLessThanOrEqual(1);
        expect(Math.abs(y)).toBeLessThanOrEqual(1);
      }
    });
  }
});
