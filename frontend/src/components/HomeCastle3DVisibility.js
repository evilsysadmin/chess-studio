export function homeCastleShouldRender({ documentHidden = false, intersecting = true } = {}) {
  return !documentHidden && intersecting;
}
