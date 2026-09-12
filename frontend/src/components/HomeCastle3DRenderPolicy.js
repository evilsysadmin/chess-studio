export const HOME_CASTLE_3D_MIN_WIDTH = 1000;

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
  const constrained = width < 1200 || cores <= 4;
  const pixelRatioCap = constrained ? 1.25 : 1.5;

  return Object.freeze({
    enabled,
    pixelRatio: Math.min(dpr, pixelRatioCap),
  });
}
