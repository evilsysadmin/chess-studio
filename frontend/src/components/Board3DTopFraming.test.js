import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { fitBoardCamera } from './Board3DScene.js';

describe('War Room desktop top framing', () => {
  it('mantiene techo/decoración y faldón cercano dentro del encuadre sin alejar el tablero', () => {
    vi.stubGlobal('window', {
      innerWidth: 1600,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    try {
      for (const whiteSide of [true, false]) {
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
        fitBoardCamera(camera, 1400, 500, whiteSide);
        camera.updateMatrixWorld(true);

        const farZ = whiteSide ? -7.6 : 7.6;
        const nearZ = whiteSide ? 5 : -5;
        const roomTop = new THREE.Vector3(0, 5.57, farZ).project(camera);
        const nearApron = new THREE.Vector3(0, -0.55, nearZ).project(camera);

        expect(roomTop.y).toBeLessThan(0.98);
        expect(nearApron.y).toBeGreaterThan(-0.98);
        expect(camera.userData.cameraDistance).toBeLessThan(23);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
