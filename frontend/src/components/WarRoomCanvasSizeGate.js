// ResizeObserver often reports the dimensions just applied during the
// initial War Room mount. Skipping duplicate drawing-buffer reallocations also
// prevents an avoidable WebGL viewport reset before its first complete frame.
export function createWarRoomCanvasSizeGate() {
  let width = null;
  let height = null;
  return ({ width: nextWidth, height: nextHeight }) => {
    if (nextWidth === width && nextHeight === height) return false;
    width = nextWidth;
    height = nextHeight;
    return true;
  };
}
