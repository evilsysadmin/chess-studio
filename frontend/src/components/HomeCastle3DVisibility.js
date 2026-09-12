export function homeCastleShouldRender({ documentHidden = false, intersecting = true } = {}) {
  return !documentHidden && intersecting;
}

export function homeCastleNeedsContinuousRender({ reducedMotion = false } = {}) {
  return !reducedMotion;
}
