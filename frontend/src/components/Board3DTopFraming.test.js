import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { fitBoardCamera } from './Board3DScene.js';

describe('War Room desktop top framing', () => {
  it('mantiene techo/decoración y faldón cercano en el encuadre con la lente larga de paridad', () => {
    vi.stubGlobal('window', {
      innerWidth: 1600,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    try {
      for (const whiteSide of [true, false]) {
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
        fitBoardCamera(camera, 1400, 500, whiteSide, { variant: 'v2' });
        camera.updateMatrixWorld(true);

        const farZ = whiteSide ? -7.6 : 7.6;
        const nearZ = whiteSide ? 5 : -5;
        const roomTop = new THREE.Vector3(0, 5.57, farZ).project(camera);
        const nearApron = new THREE.Vector3(0, -0.55, nearZ).project(camera);

        // The 22° desktop lens deliberately travels farther back than the old
        // 29° profile to reduce near/far piece-scale distortion. Keep a tiny
        // projection tolerance for the architectural cap while still guarding
        // against meaningful top/bottom cropping or runaway camera distance.
        expect(roomTop.y).toBeLessThan(1.01);
        expect(nearApron.y).toBeGreaterThan(-0.98);
        expect(camera.userData.cameraDistance).toBeLessThan(30);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('mantiene el tablero jugable con el picado deliberado de V1 clásica', () => {
    vi.stubGlobal('window', {
      innerWidth: 1600,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    try {
      for (const whiteSide of [true, false]) {
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
        fitBoardCamera(camera, 1400, 500, whiteSide, { variant: 'classic' });
        camera.updateMatrixWorld(true);

        const farZ = whiteSide ? -7.6 : 7.6;
        const nearZ = whiteSide ? 5 : -5;
        const roomTop = new THREE.Vector3(0, 5.57, farZ).project(camera);
        const nearApron = new THREE.Vector3(0, -0.55, nearZ).project(camera);
        const target = camera.userData.baseTarget;
        const offset = camera.position.clone().sub(target);
        const elevation = THREE.MathUtils.radToDeg(Math.atan2(offset.y, Math.abs(offset.z)));

        // V1 trades a controlled slice of upper-room decoration for clearer rank
        // separation. The nearby board/apron must remain fully playable.
        expect(roomTop.y).toBeGreaterThan(1.05);
        expect(roomTop.y).toBeLessThan(1.18);
        expect(nearApron.y).toBeGreaterThan(-0.98);
        expect(elevation).toBeGreaterThan(34);
        expect(elevation).toBeLessThan(36);
        expect(camera.userData.cameraDistance).toBeLessThan(30);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
