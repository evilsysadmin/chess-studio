export const HOME_CASTLE_3D_MIN_WIDTH = 1000;
export const HOME_CASTLE_3D_LITE_MIN_WIDTH = 360;

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function homeCastle3DRenderPolicy({
  viewportWidth,
  devicePixelRatio = 1,
  hardwareConcurrency = 8,
} = {}) {
  const width = finitePositive(viewportWidth, 0);
  const dpr = finitePositive(devicePixelRatio, 1);
  const cores = finitePositive(hardwareConcurrency, 8);

  const enabled = width >= HOME_CASTLE_3D_MIN_WIDTH;
  const lod = width < HOME_CASTLE_3D_LITE_MIN_WIDTH || cores <= 2
    ? '2d'
    : (enabled && width >= 1200 && cores > 4 ? 'full' : 'lite');

  const pixelRatioCap = lod === 'full' ? 1.5 : 1.25;
  const minFrameIntervalMs = lod === 'lite' ? 1000 / 30 : 0;

  return Object.freeze({
    enabled,
    lod,
    pixelRatio: Math.min(dpr, pixelRatioCap),
    minFrameIntervalMs,
  });
}
