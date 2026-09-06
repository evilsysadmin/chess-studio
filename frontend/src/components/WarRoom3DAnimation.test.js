import { describe, expect, it } from 'vitest';
import {
  compactWebGLRendererLabel,
  isSoftwareWebGLRenderer,
  warRoomAmbientFramePlan,
  warRoomRendererAttempts,
  warRoomSceneProfile,
} from './WarRoom3DAnimation.js';

describe('War Room ambient render cadence', () => {
  it('mantiene fuego autónomo a ~10 FPS en desktop sin inspección ni input', () => {
    expect(warRoomAmbientFramePlan({ elapsedMs: 99, inspectMode: false }).shouldRender).toBe(false);
    const plan = warRoomAmbientFramePlan({ elapsedMs: 100, inspectMode: false });
    expect(plan.active).toBe(true);
    expect(plan.intervalMs).toBe(100);
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

  it('clasifica el renderer para diagnóstico humano sin filtrar cadenas enormes', () => {
    expect(compactWebGLRendererLabel('ANGLE (NVIDIA GeForce RTX 3060 Laptop GPU)')).toBe('NVIDIA');
    expect(compactWebGLRendererLabel('Mesa Intel(R) UHD Graphics (CML GT2)')).toBe('INTEL');
    expect(compactWebGLRendererLabel('AMD Radeon RX 7800 XT (RADV NAVI32)')).toBe('AMD');
    expect(compactWebGLRendererLabel('ANGLE (Apple, ANGLE Metal Renderer: Apple M4)')).toBe('APPLE');
    expect(compactWebGLRendererLabel('llvmpipe (LLVM 19.1.7, 256 bits)')).toBe('SOFTWARE');
    expect(compactWebGLRendererLabel('Mystery GPU 9000')).toBe('GPU');
    expect(compactWebGLRendererLabel('')).toBe('UNKNOWN');
  });

  it('prioriza GPU con y sin MSAA antes de permitir el fallback lite', () => {
    const attempts = warRoomRendererAttempts();
    expect(attempts.map((attempt) => attempt.id)).toEqual(['gpu-aa', 'gpu-noaa', 'fallback-lite']);

    expect(attempts[0]).toMatchObject({
      liteFallback: false,
      parameters: {
        antialias: true,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: true,
      },
    });
    expect(attempts[1]).toMatchObject({
      liteFallback: false,
      parameters: {
        antialias: false,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: true,
      },
    });
    expect(attempts[2]).toMatchObject({
      liteFallback: true,
      parameters: {
        antialias: false,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false,
      },
    });
  });

  it('mantiene geometría completa pero nace con presupuesto GPU sensato en desktop', () => {
    expect(warRoomSceneProfile()).toEqual({
      tier: 'full',
      lite: false,
      pixelRatioCap: 1.2,
      shadowMapSize: 1024,
      shadowsEnabled: true,
    });
    expect(warRoomSceneProfile({ coarsePointer: true })).toEqual({
      tier: 'balanced',
      lite: false,
      pixelRatioCap: 1.25,
      shadowMapSize: 1024,
      shadowsEnabled: true,
    });
    expect(warRoomSceneProfile({ softwareRenderer: true })).toEqual({
      tier: 'lite',
      lite: true,
      pixelRatioCap: 1,
      shadowMapSize: 512,
      shadowsEnabled: false,
    });
    expect(warRoomSceneProfile({ coarsePointer: true, softwareRenderer: true })).toEqual({
      tier: 'lite',
      lite: true,
      pixelRatioCap: 1,
      shadowMapSize: 512,
      shadowsEnabled: false,
    });
  });
});
