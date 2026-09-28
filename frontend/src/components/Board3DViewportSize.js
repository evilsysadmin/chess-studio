export function resolveStableBoardViewport({
  hostWidth,
  hostHeight,
  immersive = false,
  viewportWidth,
  viewportHeight,
} = {}) {
  const safeHostWidth = Math.max(280, Number(hostWidth) || 280);
  const safeHostHeight = Math.max(300, Number(hostHeight) || 300);

  if (!immersive) {
    return Object.freeze({ width: safeHostWidth, height: safeHostHeight, source: 'host' });
  }

  const safeViewportWidth = Math.max(280, Number(viewportWidth) || safeHostWidth);
  const safeViewportHeight = Math.max(300, Number(viewportHeight) || safeHostHeight);
  return Object.freeze({
    width: safeViewportWidth,
    height: safeViewportHeight,
    source: 'immersive-viewport',
  });
}
