export function threeSurfaceShouldRender({
  documentHidden = false,
  intersecting = true,
  paused = false,
} = {}) {
  return !documentHidden && intersecting && !paused;
}

export function threeSurfaceNeedsContinuousRender({
  reducedMotion = false,
  animated = true,
} = {}) {
  return animated && !reducedMotion;
}
