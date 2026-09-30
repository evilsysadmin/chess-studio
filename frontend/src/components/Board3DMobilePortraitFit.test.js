import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fitBoardCamera } from './Board3DScene.js';
import { board3DProjectionSnapshot } from './Board3DProjectionDiagnostics.js';
import { WAR_ROOM_MOBILE_FRAMING_VERSION } from './WarRoomMobileFraming.js';

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

describe('War Room · encaje del tablero en teléfono vertical', () => {
  let previousWindow;
  beforeEach(() => { previousWindow = globalThis.window; });
  afterEach(() => { globalThis.window = previousWindow; });

  for (const { viewport: [vw, vh], canvas: [cw, ch], profile = 'tactical', immersive = true } of PHONES) {
    it(`${vw}x${vh} · canvas ${cw}x${ch}: tablero al 88–100 % del ancho y 64 casillas en pantalla`, () => {
      globalThis.window = { matchMedia: () => ({ matches: true }), innerWidth: vw, innerHeight: vh };
      const camera = new THREE.PerspectiveCamera(40, cw / ch, 0.1, 200);
      fitBoardCamera(camera, cw, ch, true, { profile, immersive });
      camera.updateMatrixWorld();
      expect(camera.userData.framingProfile).toBe(WAR_ROOM_MOBILE_FRAMING_VERSION);

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
