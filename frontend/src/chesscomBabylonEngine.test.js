import { describe, expect, it, vi } from 'vitest';
import { chesscomEngineQualityVersion, createChesscomEngine } from './chesscomBabylonEngine.js';

function fakeBabylon({ webGpuSupported = false, webGpuInitFails = false } = {}) {
  const webGlInstances = [];
  const webGpuInstances = [];

  class Engine {
    constructor(canvas, antialias, options) {
      this.canvas = canvas;
      this.antialias = antialias;
      this.options = options;
      this.webGLVersion = 2;
      webGlInstances.push(this);
    }
  }

  class WebGPUEngine {
    static IsSupportedAsync = Promise.resolve(webGpuSupported);

    constructor(canvas) {
      this.canvas = canvas;
      this.isWebGPU = true;
      this.dispose = vi.fn();
      webGpuInstances.push(this);
    }

    async initAsync() {
      if (webGpuInitFails) throw new Error('WebGPU init failed');
    }
  }

  return { B:{ Engine, WebGPUEngine }, webGlInstances, webGpuInstances };
}

describe('Chesscom Babylon engine selection', () => {
  it('prefiere WebGPU cuando Babylon lo soporta y la inicialización termina bien', async () => {
    const { B, webGlInstances, webGpuInstances } = fakeBabylon({ webGpuSupported:true });
    const canvas = {};

    const result = await createChesscomEngine(B, canvas);

    expect(result.backend).toBe('webgpu');
    expect(result.engine).toBe(webGpuInstances[0]);
    expect(webGlInstances).toHaveLength(0);
    expect(chesscomEngineQualityVersion(result.engine)).toBe(2);
  });

  it('usa WebGL2 directamente cuando WebGPU no está soportado', async () => {
    const { B, webGlInstances } = fakeBabylon({ webGpuSupported:false });

    const result = await createChesscomEngine(B, {}, { coarse:true });

    expect(result.backend).toBe('webgl2');
    expect(result.engine).toBe(webGlInstances[0]);
    expect(webGlInstances[0].options).toMatchObject({ antialias:false, stencil:true, adaptToDeviceRatio:true });
    expect(chesscomEngineQualityVersion(result.engine)).toBe(2);
  });

  it('destruye el engine WebGPU parcial y cae a WebGL2 si initAsync falla', async () => {
    const { B, webGlInstances, webGpuInstances } = fakeBabylon({ webGpuSupported:true, webGpuInitFails:true });

    const result = await createChesscomEngine(B, {});

    expect(webGpuInstances).toHaveLength(1);
    expect(webGpuInstances[0].dispose).toHaveBeenCalledOnce();
    expect(result.backend).toBe('webgl2');
    expect(result.engine).toBe(webGlInstances[0]);
    expect(webGlInstances[0].options.antialias).toBe(true);
  });

  it('trata WebGPU como backend moderno para el perfil de calidad', () => {
    expect(chesscomEngineQualityVersion({ isWebGPU:true, webGLVersion:0 })).toBe(2);
    expect(chesscomEngineQualityVersion({ webGLVersion:1 })).toBe(1);
  });
});
