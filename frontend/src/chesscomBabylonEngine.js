export function chesscomEngineQualityVersion(engine) {
  return engine?.isWebGPU ? 2 : (Number(engine?.webGLVersion) || 1);
}

function createWebGlEngine(B, canvas, coarse) {
  return new B.Engine(canvas, true, {
    preserveDrawingBuffer:false,
    stencil:true,
    antialias:!coarse,
    adaptToDeviceRatio:true,
  });
}

export async function createChesscomEngine(B, canvas, { coarse = false } = {}) {
  let webGpuEngine = null;
  try {
    const supported = typeof B?.WebGPUEngine === 'function'
      ? await B.WebGPUEngine.IsSupportedAsync
      : false;
    if (supported) {
      webGpuEngine = new B.WebGPUEngine(canvas);
      await webGpuEngine.initAsync();
      return { engine:webGpuEngine, backend:'webgpu' };
    }
  } catch {
    try { webGpuEngine?.dispose?.(); } catch {}
  }

  return {
    engine:createWebGlEngine(B, canvas, coarse),
    backend:'webgl2',
  };
}
