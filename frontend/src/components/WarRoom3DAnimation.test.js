import { describe, expect, it } from 'vitest';
import { isSoftwareWebGLRenderer, warRoomAmbientFramePlan, warRoomSceneProfile } from './WarRoom3DAnimation.js';

describe('War Room ambient render cadence', () => {
  it('mantiene fuego autónomo a ~12 FPS en desktop sin inspección ni input', () => {
    expect(warRoomAmbientFramePlan({ elapsedMs: 82, inspectMode: false }).shouldRender).toBe(false);
    const plan = warRoomAmbientFramePlan({ elapsedMs: 83, inspectMode: false });
    expect(plan.active).toBe(true);
    expect(plan.intervalMs).toBe(83);
    expect(plan.shouldRender).toBe(true);
    expect(plan.updateCamera).toBe(false);
  });

  it('mantiene el fuego vivo a ~10 FPS en móvil sin convertirlo en un loop caro', () => {
    expect(warRoomAmbientFramePlan({ elapsedMs: 99, coarsePointer: true }).shouldRender).toBe(false);
    const plan = warRoomAmbientFramePlan({ elapsedMs: 100, coarsePointer: true });
    expect(plan.active).toBe(true);
    expect(plan.intervalMs).toBe(100);
    expect(plan.shouldRender).toBe(true);
    expect(plan.updateCamera).toBe(false);
  });

  it('sube la cámara de inspección a ~60 FPS en desktop y ~30 FPS en móvil', () => {
    const desktop = warRoomAmbientFramePlan({ elapsedMs: 16, inspectMode: true });
    expect(desktop.intervalMs).toBe(16);
    expect(desktop.shouldRender).toBe(true);
    expect(desktop.updateCamera).toBe(true);

    const mobile = warRoomAmbientFramePlan({ elapsedMs: 33, inspectMode: true, coarsePointer: true });
    expect(mobile.intervalMs).toBe(33);
    expect(mobile.shouldRender).toBe(true);
    expect(mobile.updateCamera).toBe(true);
  });

  it('no fuerza repaint ambiental con pestaña oculta, reduced motion o rasterizador software', () => {
    for (const options of [
      { elapsedMs: 1000, documentHidden: true },
      { elapsedMs: 1000, reducedMotion: true },
      { elapsedMs: 1000, softwareRenderer: true },
      { elapsedMs: 1000, coarsePointer: true, softwareRenderer: true },
    ]) {
      expect(warRoomAmbientFramePlan(options).shouldRender).toBe(false);
    }
  });

  it('detecta rasterizadores software conocidos sin penalizar GPUs reales', () => {
    for (const label of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))',
      'llvmpipe (LLVM 19.1.7, 256 bits)',
      'Mesa lavapipe',
      'Software Rasterizer',
    ]) {
      expect(isSoftwareWebGLRenderer(label)).toBe(true);
    }
    expect(isSoftwareWebGLRenderer('ANGLE (NVIDIA GeForce RTX 4070)')).toBe(false);
    expect(isSoftwareWebGLRenderer('AMD Radeon RX 7800 XT (RADV NAVI32)')).toBe(false);
  });

  it('reduce sólo el coste visual en software WebGL sin convertir desktop en input móvil', () => {
    expect(warRoomSceneProfile()).toEqual({
      tier: 'full',
      lite: false,
      pixelRatioCap: 1.75,
      shadowMapSize: 2048,
      shadowsEnabled: true,
    });
    expect(warRoomSceneProfile({ coarsePointer: true })).toEqual({
      tier: 'lite',
      lite: true,
      pixelRatioCap: 1.25,
      shadowMapSize: 512,
      shadowsEnabled: true,
    });
    expect(warRoomSceneProfile({ softwareRenderer: true })).toEqual({
      tier: 'lite',
      lite: true,
      pixelRatioCap: 1,
      shadowMapSize: 512,
      shadowsEnabled: false,
    });
  });
});
