// Batch ordinary React effect and ResizeObserver paints into one browser frame.
// Explicit animation/ambient/Hans paints still flush immediately.
export function createWarRoomRenderBatcher({ requestFrame, cancelFrame, draw } = {}) {
  let pendingFrame = null;
  let generation = 0;
  let disposed = false;

  const request = () => {
    if (disposed || pendingFrame !== null) return;
    const ownGeneration = ++generation;
    pendingFrame = requestFrame(() => {
      if (disposed || ownGeneration !== generation) return;
      pendingFrame = null;
      draw();
    });
  };

  const flush = () => {
    if (disposed) return;
    if (pendingFrame !== null) {
      ++generation;
      cancelFrame(pendingFrame);
      pendingFrame = null;
    }
    draw();
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
