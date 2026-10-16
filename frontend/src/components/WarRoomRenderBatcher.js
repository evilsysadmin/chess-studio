// Batch ordinary React effect and ResizeObserver paints into one browser frame.
// Explicit animation/ambient/Hans paints still flush immediately.
export function createWarRoomRenderBatcher({
  requestFrame, cancelFrame, draw, benchmarkProbe,
} = {}) {
  let pendingFrame = null;
  let generation = 0;
  let disposed = false;

  // The A/B branch is enabled only in a special diagnostic Vite build.
  // Normal production builds cannot select the old unbatched path.
  const probe = benchmarkProbe ?? (
    import.meta.env?.VITE_WARROOM_RENDER_AB === '1'
      ? globalThis.__chessWarRoomRenderAB
      : null
  );
  const paint = (source) => {
    if (!probe) return draw();
    const start = performance.now();
    try {
      return draw();
    } finally {
      probe.onDraw?.({
        source,
        atMs: performance.now(),
        synchronousMs: Math.max(0, performance.now() - start),
      });
    }
  };

  const request = () => {
    if (disposed) return;
    if (probe?.mode === 'legacy') {
      paint('effect');
      return;
    }
    if (pendingFrame !== null) return;
    const ownGeneration = ++generation;
    pendingFrame = requestFrame(() => {
      if (disposed || ownGeneration !== generation) return;
      pendingFrame = null;
      paint('effect');
    });
  };

  const flush = () => {
    if (disposed) return;
    if (pendingFrame !== null) {
      ++generation;
      cancelFrame(pendingFrame);
      pendingFrame = null;
    }
    paint('direct');
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ++generation;
    if (pendingFrame !== null) {
      cancelFrame(pendingFrame);
      pendingFrame = null;
    }
  };

  return { request, flush, dispose };
}
